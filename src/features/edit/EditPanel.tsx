import { Clipboard, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { KIND_ICON } from '../../shared/icons';
import type {
    EditSelectionItem,
    EditUiSyncPayload,
    EditDeleteSelectedPayload,
    EditDeleteSelectedResponseData,
    ExtensionMessage,
    ExtensionResponse,
} from '../../shared/types/messages';

interface EditPanelProps {
    eventSettingAvailable: boolean;
}

export function EditPanel({ eventSettingAvailable }: EditPanelProps) {
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedItems, setSelectedItems] = useState<EditSelectionItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [lastError, setLastError] = useState<string | null>(null);
    const [lastInfo, setLastInfo] = useState<string | null>(null);

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
                    setLastInfo(null);
                }
            }
        };
        chrome.runtime.onMessage.addListener(onMsg);
        return () => chrome.runtime.onMessage.removeListener(onMsg);
    }, []);

    const handleStartSelection = () => {
        setLastError(null);
        setLastInfo(null);
        chrome.runtime.sendMessage(
            { action: 'EDIT_START' } satisfies ExtensionMessage,
            (res: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    setLastError(chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                if (res?.success) {
                    setIsSelecting(true);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    return;
                }
                setLastError(
                    typeof res?.error === 'string' ? res.error : '선택 모드를 켤 수 없습니다.',
                );
            },
        );
    };

    const handleEndSelection = () => {
        setLastError(null);
        setLastInfo(null);
        chrome.runtime.sendMessage(
            { action: 'EDIT_STOP' } satisfies ExtensionMessage,
            () => {
                if (chrome.runtime.lastError) {
                    setLastError(chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                setIsSelecting(false);
                setSelectedItems([]);
                setCurrentIndex(-1);
            },
        );
    };

    const handleCopySelected = async () => {
        setLastError(null);
        setLastInfo(null);
        try {
            const json = selectedItems.map((item) => item.json);
            await navigator.clipboard.writeText(JSON.stringify(json, null, 2));
            setLastInfo(`${selectedItems.length}개 로직을 클립보드에 복사했습니다.`);
        } catch {
            setLastError('클립보드에 복사할 수 없습니다.');
        }
    };

    const handleDeleteSelected = () => {
        setLastError(null);
        setLastInfo(null);
        const logicIds = selectedItems.map((item) => item.logicId);
        chrome.runtime.sendMessage(
            {
                action: 'EDIT_DELETE_SELECTED',
                payload: { logicIds } satisfies EditDeleteSelectedPayload,
            } satisfies ExtensionMessage,
            (res: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    setLastError(chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                const data = res?.data as EditDeleteSelectedResponseData | undefined;
                if (res?.success && data) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    setLastInfo(`${data.deletedCount}개 로직을 삭제했습니다.`);
                    return;
                }
                if (data && data.deletedCount > 0) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(-1);
                    setLastError(
                        `${data.deletedCount}개 삭제, ${data.errors.length}개 실패했습니다.`,
                    );
                    return;
                }
                setLastError(
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
            <div className="panel__notice">
                {lastError ? (
                    <span className="panel__hint panel__hint--error">{lastError}</span>
                ) : lastInfo ? (
                    <span className="panel__hint panel__hint--success">{lastInfo}</span>
                ) : isSelecting ? (
                    '페이지 왼쪽 seq 열에서 클릭·Shift+클릭·드래그로 선택합니다. 드래그 경로를 지나는 줄은 선택/비선택이 토글됩니다. Esc·패널 닫기·접기·페이지 이동 시에도 모드가 꺼집니다. 또는 선택 종료를 누르세요.'
                ) : (
                    '선택 시작을 누르면 eventSetting 화면의 seq 열에 선택 핸들이 나타납니다.'
                )}
            </div>
        </div>
    );
}
