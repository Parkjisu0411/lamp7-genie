import { Clipboard, ClipboardPaste, Play, Square, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { NotifyPanel } from '../../content/panelNotice';
import {
    getEditClipboardLogics,
    setEditClipboardLogics,
    STORAGE_KEYS,
} from '../../content/storage';
import { KIND_ICON } from '../../shared/icons';
import { isExtensionContextValid } from '../../shared/extensionContext';
import { logicKindFromJson } from '../../shared/logicKind';
import type {
    EditCopySelectedPayload,
    EditCopySelectedResponseData,
    EditDeleteSelectedPayload,
    EditDeleteSelectedResponseData,
    EditPasteLogicsPayload,
    EditPasteLogicsResponseData,
    EditSelectionItem,
    EditUiSyncPayload,
    ExtensionMessage,
    ExtensionResponse,
    LogicKind,
} from '../../shared/types/messages';

interface EditPanelProps {
    eventSettingAvailable: boolean;
    notify: NotifyPanel;
    clearNotice: () => void;
}

type EditListItem = Pick<
    EditSelectionItem,
    'id' | 'logicId' | 'kind' | 'snippet' | 'seq' | 'json'
>;

function sendEditMessage(
    message: ExtensionMessage,
    onResponse?: (res: ExtensionResponse | undefined) => void,
): void {
    if (!isExtensionContextValid()) {
        onResponse?.(undefined);
        return;
    }
    try {
        chrome.runtime.sendMessage(message, (res: ExtensionResponse | undefined) => {
            // lastError는 콜백에서만 읽음 — invalidated면 보통 여기로 옴
            onResponse?.(res);
        });
    } catch {
        onResponse?.(undefined);
    }
}

function copiedLogicToListItem(logic: unknown, index: number): EditListItem | null {
    if (!logic || typeof logic !== 'object' || Array.isArray(logic)) return null;
    const raw = logic as Record<string, unknown>;
    const asString = (value: unknown): string =>
        typeof value === 'string'
            ? value
            : typeof value === 'number' && Number.isFinite(value)
              ? String(value)
              : '';
    const kind: LogicKind = logicKindFromJson(logic) ?? 'event';
    const logicId = asString(raw.id) || `copied-${index}`;
    const label =
        asString(raw.displayText) ||
        asString(raw.name) ||
        asString(raw.label) ||
        logicId;
    return {
        id: logicId,
        logicId,
        kind,
        snippet: label,
        seq: asString(raw.seq),
        json: logic,
    };
}

function copiedLogicsToListItems(logics: unknown[]): EditListItem[] {
    return logics
        .map((logic, index) => copiedLogicToListItem(logic, index))
        .filter((item): item is EditListItem => item !== null);
}

function applyClipboardState(
    logics: unknown[],
    setCopiedLogics: (v: unknown[]) => void,
    setCopiedItems: (v: EditListItem[]) => void,
    setCurrentIndex: (v: number) => void,
) {
    setCopiedLogics(logics);
    setCopiedItems(copiedLogicsToListItems(logics));
    setCurrentIndex(logics.length > 0 ? 0 : -1);
}

export function EditPanel({
    eventSettingAvailable,
    notify,
    clearNotice,
}: EditPanelProps) {
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedItems, setSelectedItems] = useState<EditSelectionItem[]>([]);
    const [copiedItems, setCopiedItems] = useState<EditListItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [copiedLogics, setCopiedLogics] = useState<unknown[]>([]);

    useEffect(() => {
        void getEditClipboardLogics().then((stored) => {
            applyClipboardState(stored, setCopiedLogics, setCopiedItems, setCurrentIndex);
        });
    }, []);

    // 다른 탭/프레임에서 복사한 내용을 실시간 반영
    useEffect(() => {
        if (!isExtensionContextValid()) return;
        const onChanged = (
            changes: { [key: string]: chrome.storage.StorageChange },
            areaName: string,
        ) => {
            if (!isExtensionContextValid()) return;
            if (areaName !== 'local') return;
            const change = changes[STORAGE_KEYS.EDIT_CLIPBOARD_LOGICS];
            if (!change) return;
            const next = Array.isArray(change.newValue) ? change.newValue : [];
            applyClipboardState(next, setCopiedLogics, setCopiedItems, setCurrentIndex);
        };
        try {
            chrome.storage.onChanged.addListener(onChanged);
        } catch {
            return;
        }
        return () => {
            try {
                chrome.storage.onChanged.removeListener(onChanged);
            } catch {
                /* extension context invalidated */
            }
        };
    }, []);

    useEffect(() => {
        if (!isExtensionContextValid()) return;
        const onMsg = (msg: ExtensionMessage) => {
            if (!isExtensionContextValid()) return;
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
        try {
            chrome.runtime.onMessage.addListener(onMsg);
        } catch {
            return;
        }
        return () => {
            try {
                chrome.runtime.onMessage.removeListener(onMsg);
            } catch {
                /* extension context invalidated */
            }
        };
    }, [notify]);

    const handleStartSelection = () => {
        clearNotice();
        setSelectedItems([]);
        setCurrentIndex(copiedLogics.length > 0 ? 0 : -1);
        sendEditMessage({ action: 'EDIT_START' }, (res) => {
            if (chrome.runtime.lastError) {
                notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                return;
            }
            if (res?.success) {
                setIsSelecting(true);
                setSelectedItems([]);
                setCurrentIndex(copiedLogics.length > 0 ? 0 : -1);
                return;
            }
            notify(
                'error',
                typeof res?.error === 'string' ? res.error : '선택 모드를 켤 수 없습니다.',
            );
        });
    };

    const handleEndSelection = () => {
        clearNotice();
        sendEditMessage({ action: 'EDIT_STOP' }, () => {
            if (chrome.runtime.lastError) {
                notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                return;
            }
            setIsSelecting(false);
            setSelectedItems([]);
            setCurrentIndex(copiedLogics.length > 0 ? 0 : -1);
        });
    };

    const handleCopySelected = () => {
        clearNotice();
        const logicIds = selectedItems.map((item) => item.logicId).filter(Boolean);
        if (logicIds.length === 0) {
            notify('error', '복사할 로직이 없습니다.');
            return;
        }

        sendEditMessage(
            {
                action: 'EDIT_COPY_SELECTED',
                payload: { logicIds } satisfies EditCopySelectedPayload,
            },
            (res) => {
                void (async () => {
                    if (chrome.runtime.lastError) {
                        notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                        return;
                    }
                    const data = res?.data as EditCopySelectedResponseData | undefined;
                    const logics = Array.isArray(data?.logics) ? data.logics : [];
                    if (!res?.success || logics.length === 0) {
                        notify(
                            'error',
                            typeof res?.error === 'string'
                                ? res.error
                                : '복사할 로직 JSON이 없습니다.',
                        );
                        return;
                    }
                    try {
                        await navigator.clipboard.writeText(JSON.stringify(logics, null, 2));
                    } catch {
                        // 시스템 클립보드 실패해도 확장 storage에는 저장
                    }
                    try {
                        await setEditClipboardLogics(logics);
                        applyClipboardState(
                            logics,
                            setCopiedLogics,
                            setCopiedItems,
                            setCurrentIndex,
                        );
                        sendEditMessage({ action: 'EDIT_STOP' });
                        setIsSelecting(false);
                        setSelectedItems([]);
                        notify('success', `${logics.length}개 로직을 클립보드에 복사했습니다.`);
                    } catch {
                        notify('error', '클립보드에 복사할 수 없습니다.');
                    }
                })();
            },
        );
    };

    const handlePasteCopied = () => {
        clearNotice();
        void (async () => {
            // 탭 간 동기화를 위해 state보다 storage를 우선 사용
            const logics = await getEditClipboardLogics();
            const payloadLogics = logics.length > 0 ? logics : copiedLogics;
            if (payloadLogics.length === 0) {
                notify('error', '붙여넣을 로직이 없습니다.');
                return;
            }
            applyClipboardState(
                payloadLogics,
                setCopiedLogics,
                setCopiedItems,
                setCurrentIndex,
            );

            sendEditMessage(
                {
                    action: 'EDIT_PASTE_LOGICS',
                    payload: { logics: payloadLogics } satisfies EditPasteLogicsPayload,
                },
                (res) => {
                    if (chrome.runtime.lastError) {
                        notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                        return;
                    }
                    const data = res?.data as EditPasteLogicsResponseData | undefined;
                    if (res?.success && data) {
                        setIsSelecting(false);
                        setSelectedItems([]);
                        setCurrentIndex(payloadLogics.length > 0 ? 0 : -1);
                        notify('success', `${data.createdCount}개 로직을 붙여넣었습니다.`);
                        return;
                    }
                    if (data && data.createdCount > 0) {
                        setIsSelecting(false);
                        setSelectedItems([]);
                        setCurrentIndex(payloadLogics.length > 0 ? 0 : -1);
                        notify(
                            'error',
                            `${data.createdCount}개 붙여넣기, ${data.errors.length}개 실패했습니다.`,
                        );
                        return;
                    }
                    notify(
                        'error',
                        typeof res?.error === 'string'
                            ? res.error
                            : '로직을 붙여넣을 수 없습니다.',
                    );
                },
            );
        })();
    };

    const handleDeleteSelected = () => {
        clearNotice();
        const logicIds = selectedItems.map((item) => item.logicId);
        sendEditMessage(
            {
                action: 'EDIT_DELETE_SELECTED',
                payload: { logicIds } satisfies EditDeleteSelectedPayload,
            },
            (res) => {
                if (chrome.runtime.lastError) {
                    notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                const data = res?.data as EditDeleteSelectedResponseData | undefined;
                if (res?.success && data) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(copiedLogics.length > 0 ? 0 : -1);
                    notify('success', `${data.deletedCount}개 로직을 삭제했습니다.`);
                    return;
                }
                if (data && data.deletedCount > 0) {
                    setIsSelecting(false);
                    setSelectedItems([]);
                    setCurrentIndex(copiedLogics.length > 0 ? 0 : -1);
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

    const displayedItems = selectedItems.length > 0 ? selectedItems : copiedItems;
    const resultLabel = selectedItems.length > 0 ? '선택된 로직' : '복사된 로직';
    const displayIndex =
        displayedItems.length > 0
            ? Math.max(0, Math.min(currentIndex, displayedItems.length - 1))
            : -1;

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
            {!isSelecting && copiedLogics.length > 0 && (
                <button
                    type="button"
                    onClick={handlePasteCopied}
                    disabled={!eventSettingAvailable}
                    className="panel__btn panel__btn--primary"
                >
                    <ClipboardPaste size={14} />
                    붙여넣기
                </button>
            )}
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
            {displayedItems.length > 0 && (
                <div className="panel__results">
                    <div className="panel__results-header">
                        <span>
                            {resultLabel} {displayIndex + 1} / {displayedItems.length}
                        </span>
                    </div>
                    <ul className="panel__results-list">
                        {displayedItems.map((item, i) => {
                            const Icon = KIND_ICON[item.kind];
                            return (
                                <li
                                    key={item.id}
                                    className={`panel__result-item ${i === displayIndex ? 'panel__result-item--active' : ''}`}
                                    onClick={() => setCurrentIndex(i)}
                                    title={`${item.kind} · ${item.logicId}`}
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
