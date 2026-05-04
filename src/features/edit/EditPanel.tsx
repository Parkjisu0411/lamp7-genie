import { Clipboard, ClipboardPaste, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NotifyPanel, SetPanelGuide } from '../../content/panelNotice';
import { getEditClipboardLogics, setEditClipboardLogics } from '../../content/storage';
import { KIND_ICON } from '../../shared/icons';
import type {
    EditDeleteSelectedPayload,
    EditDeleteSelectedResponseData,
    EditPasteLogicsPayload,
    EditPasteLogicsResponseData,
    EditSelectionItem,
    EditUiSyncPayload,
    ExtensionMessage,
    ExtensionResponse,
} from '../../shared/types/messages';

interface EditPanelProps {
    eventSettingAvailable: boolean;
    notify: NotifyPanel;
    clearNotice: () => void;
    setGuide: SetPanelGuide;
    clearGuide: () => void;
}

export function EditPanel({
    eventSettingAvailable,
    notify,
    clearNotice,
    setGuide,
    clearGuide,
}: EditPanelProps) {
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedItems, setSelectedItems] = useState<EditSelectionItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [copiedLogics, setCopiedLogics] = useState<unknown[]>([]);

    useEffect(() => {
        void getEditClipboardLogics().then((stored) => setCopiedLogics(stored));
    }, []);

    useEffect(() => {
        const onMsg = (msg: ExtensionMessage) => {
            if (msg.action === 'EDIT_UI_SYNC') {
                const p = msg.payload as EditUiSyncPayload | undefined;
                if (p && typeof p.logicEditActive === 'boolean') {
                    setIsSelecting(p.logicEditActive);
                }
                if (Array.isArray(p?.selectedItems)) {
                    setSelectedItems(p.selectedItems);
                    setCurrentIndex(p.selectedItems.length > 0 ? 0 : -1);
                }
                if (typeof p?.error === 'string') {
                    notify('error', p.error);
                }
            }
        };
        chrome.runtime.onMessage.addListener(onMsg);
        return () => chrome.runtime.onMessage.removeListener(onMsg);
    }, [notify]);

    useEffect(() => {
        setGuide(
            isSelecting
                ? '페이지 왼쪽 seq 열에서 클릭·Shift+클릭·드래그로 선택합니다. 드래그 경로를 지나는 줄은 선택/비선택이 토글됩니다. Esc·패널 닫기·접기·페이지 이동 시에도 모드가 꺼집니다. 또는 선택 종료를 누르세요.'
                : '선택 시작을 누르면 eventSetting 화면의 seq 열에 선택 핸들이 나타납니다.',
        );
        return () => clearGuide();
    }, [clearGuide, isSelecting, setGuide]);

    const handleStartSelection = () => {
        clearNotice();
        chrome.runtime.sendMessage(
            { action: 'EDIT_START' } satisfies ExtensionMessage,
            (res: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                if (res?.success) {
                    setIsSelecting(true);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    return;
                }
                notify(
                    'error',
                    typeof res?.error === 'string' ? res.error : '선택 모드를 켤 수 없습니다.',
                );
            },
        );
    };

    const handleEndSelection = () => {
        clearNotice();
        chrome.runtime.sendMessage(
            { action: 'EDIT_STOP' } satisfies ExtensionMessage,
            () => {
                if (chrome.runtime.lastError) {
                    notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                setIsSelecting(false);
                setSelectedItems([]);
                setCurrentIndex(-1);
            },
        );
    };

    const handleCopySelected = async () => {
        clearNotice();
        try {
            const json = selectedItems.map((item) => item.json);
            await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
            await setEditClipboardLogics(json);
            setCopiedLogics(json);
            notify('success', `${selectedItems.length}개 로직을 클립보드에 복사했습니다.`);
        } catch {
            notify('error', '클립보드에 복사할 수 없습니다.');
        }
    };

    const handlePasteCopied = () => {
        clearNotice();
        chrome.runtime.sendMessage(
            {
                action: 'EDIT_PASTE_LOGICS',
                payload: { logics: copiedLogics } satisfies EditPasteLogicsPayload,
            } satisfies ExtensionMessage,
            (res: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                const data = res?.data as EditPasteLogicsResponseData | undefined;
                if (res?.success && data) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    notify('success', `${data.createdCount}개 로직을 붙여넣었습니다.`);
                    return;
                }
                if (data && data.createdCount > 0) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    notify(
                        'error',
                        `${data.createdCount}개 붙여넣기, ${data.errors.length}개 실패했습니다.`,
                    );
                    return;
                }
                notify(
                    'error',
                    typeof res?.error === 'string' ? res.error : '로직을 붙여넣을 수 없습니다.',
                );
            },
        );
    };

    const handleDeleteSelected = () => {
        clearNotice();
        const logicIds = selectedItems.map((item) => item.logicId);
        chrome.runtime.sendMessage(
            {
                action: 'EDIT_DELETE_SELECTED',
                payload: { logicIds } satisfies EditDeleteSelectedPayload,
            } satisfies ExtensionMessage,
            (res: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                const data = res?.data as EditDeleteSelectedResponseData | undefined;
                if (res?.success && data) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    notify('success', `${data.deletedCount}개 로직을 삭제했습니다.`);
                    return;
                }
                if (data && data.deletedCount > 0) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    notify(
                        'error',
                        `${data.deletedCount}개 삭제, ${data.errors.length}개 실패했습니다.`,
                    );
                    return;
                }
                notify(
                    'error',
                    typeof res?.error === 'string' ? res.error : '선택 로직을 삭제할 수 없습니다.',
                );
            },
        );
    };

    return (
        <div className="panel">
            <div className="panel__row">
                <button
                    type="button"
                    onClick={handleStartSelection}
                    disabled={!eventSettingAvailable || isSelecting}
                    className="panel__btn panel__btn--success"
                    style={{ flex: 1 }}
                >
                    <Play size={14} />
                    선택 시작
                </button>
                <button
                    type="button"
                    onClick={handleEndSelection}
                    disabled={!eventSettingAvailable || !isSelecting}
                    className="panel__btn panel__btn--danger"
                    style={{ flex: 1 }}
                >
                    <Square size={14} />
                    선택 종료
                </button>
            </div>
            <button
                type="button"
                onClick={handlePasteCopied}
                disabled={!eventSettingAvailable || copiedLogics.length === 0}
                className="panel__btn panel__btn--primary"
            >
                <ClipboardPaste size={14} />
                붙여넣기
            </button>
            {selectedItems.length > 0 && (
                <div className="panel__row">
                    <button
                        type="button"
                        onClick={handleCopySelected}
                        disabled={!eventSettingAvailable}
                        className="panel__btn panel__btn--primary"
                        style={{ flex: 1 }}
                    >
                        <Clipboard size={14} />
                        복사
                    </button>
                    <button
                        type="button"
                        onClick={handleDeleteSelected}
                        disabled={!eventSettingAvailable}
                        className="panel__btn panel__btn--danger"
                        style={{ flex: 1 }}
                    >
                        <Trash2 size={14} />
                        삭제
                    </button>
                </div>
            )}
            {selectedItems.length > 0 && (
                <div className="panel__results">
                    <div className="panel__results-header">
                        <span>
                            {currentIndex + 1} / {selectedItems.length}
                        </span>
                    </div>
                    <ul className="panel__results-list">
                        {selectedItems.map((item, i) => {
                            const Icon = KIND_ICON[item.kind];
                            return (
                                <li
                                    key={item.id}
                                    className={`panel__result-item ${i === currentIndex ? 'panel__result-item--active' : ''}`}
                                    onClick={() => setCurrentIndex(i)}
                                    title={item.logicId}
                                >
                                    <span className="panel__result-seq">{item.seq || '-'}</span>
                                    <Icon
                                        className="panel__result-icon"
                                        aria-label={item.kind}
                                    />
                                    <span className="panel__result-text">{item.snippet}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
