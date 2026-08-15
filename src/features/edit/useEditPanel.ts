import { useEffect, useState } from 'react';
import { isExtensionContextValid } from '../../shared/extensionContext';
import type { NotifyPanel } from '../../shared/panelNotice';
import {
    getEditClipboardLogics,
    setEditClipboardLogics,
} from '../../shared/storage';
import type { EditSelectionItem, ExtensionMessage } from '../../shared/types/messages';
import { sendTypedEditMessage } from './editMessaging';
import { nextIndexFor, useEditClipboard } from './useEditClipboard';

interface UseEditPanelArgs {
    notify: NotifyPanel;
    clearNotice: () => void;
}

export function useEditPanel({ notify, clearNotice }: UseEditPanelArgs) {
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedItems, setSelectedItems] = useState<EditSelectionItem[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const { copiedItems, copiedLogics, applyClipboardState } =
        useEditClipboard(setCurrentIndex);

    useEffect(() => {
        if (!isExtensionContextValid()) return;
        const onMsg = (msg: ExtensionMessage) => {
            if (!isExtensionContextValid()) return;
            if (msg.action !== 'EDIT_UI_SYNC') return;
            setIsSelecting(msg.payload.logicEditActive);
            if (Array.isArray(msg.payload.selectedItems)) {
                setSelectedItems(msg.payload.selectedItems);
                setCurrentIndex(nextIndexFor(msg.payload.selectedItems));
            }
            if (typeof msg.payload.error === 'string') {
                notify('error', msg.payload.error);
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

    const resetSelection = (nextIndex = nextIndexFor(copiedLogics)) => {
        setIsSelecting(false);
        setSelectedItems([]);
        setCurrentIndex(nextIndex);
    };

    const handleStartSelection = () => {
        clearNotice();
        setSelectedItems([]);
        setCurrentIndex(nextIndexFor(copiedLogics));
        sendTypedEditMessage({ action: 'EDIT_START' }, (res) => {
            if (chrome.runtime.lastError) {
                notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                return;
            }
            if (res?.success) {
                setIsSelecting(true);
                setSelectedItems([]);
                setCurrentIndex(nextIndexFor(copiedLogics));
                return;
            }
            notify(
                'error',
                typeof res?.error === 'string'
                    ? res.error
                    : '선택 모드를 켤 수 없습니다.',
            );
        });
    };

    const handleEndSelection = () => {
        clearNotice();
        sendTypedEditMessage({ action: 'EDIT_STOP' }, () => {
            if (chrome.runtime.lastError) {
                notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                return;
            }
            resetSelection();
        });
    };

    const handleCopySelected = () => {
        clearNotice();
        const logicIds = selectedItems.map((item) => item.logicId).filter(Boolean);
        if (logicIds.length === 0) {
            notify('error', '복사할 로직이 없습니다.');
            return;
        }

        sendTypedEditMessage(
            {
                action: 'EDIT_COPY_SELECTED',
                payload: { logicIds },
            },
            (res) => {
                void (async () => {
                    if (chrome.runtime.lastError) {
                        notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                        return;
                    }
                    const logics = Array.isArray(res?.data?.logics)
                        ? res.data.logics
                        : [];
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
                        /* extension storage is still the source of truth */
                    }
                    try {
                        await setEditClipboardLogics(logics);
                        applyClipboardState(logics);
                        sendTypedEditMessage({ action: 'EDIT_STOP' });
                        resetSelection(nextIndexFor(logics));
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
            const storedLogics = await getEditClipboardLogics();
            const payloadLogics = storedLogics.length > 0 ? storedLogics : copiedLogics;
            if (payloadLogics.length === 0) {
                notify('error', '붙여넣을 로직이 없습니다.');
                return;
            }
            applyClipboardState(payloadLogics);

            sendTypedEditMessage(
                {
                    action: 'EDIT_PASTE_LOGICS',
                    payload: { logics: payloadLogics },
                },
                (res) => {
                    if (chrome.runtime.lastError) {
                        notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                        return;
                    }
                    const data = res?.data;
                    if (res?.success && data) {
                        resetSelection(nextIndexFor(payloadLogics));
                        notify('success', `${data.createdCount}개 로직을 붙여넣었습니다.`);
                        return;
                    }
                    if (data && data.createdCount > 0) {
                        resetSelection(nextIndexFor(payloadLogics));
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
        sendTypedEditMessage(
            {
                action: 'EDIT_DELETE_SELECTED',
                payload: { logicIds },
            },
            (res) => {
                if (chrome.runtime.lastError) {
                    notify('error', chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                const data = res?.data;
                if (res?.success && data) {
                    resetSelection();
                    notify('success', `${data.deletedCount}개 로직을 삭제했습니다.`);
                    return;
                }
                if (data && data.deletedCount > 0) {
                    resetSelection();
                    notify(
                        'error',
                        `${data.deletedCount}개 삭제, ${data.errors.length}개 실패했습니다.`,
                    );
                    return;
                }
                notify(
                    'error',
                    typeof res?.error === 'string'
                        ? res.error
                        : '선택한 로직을 삭제할 수 없습니다.',
                );
            },
        );
    };

    const displayedItems = selectedItems.length > 0 ? selectedItems : copiedItems;
    const displayIndex =
        displayedItems.length > 0
            ? Math.max(0, Math.min(currentIndex, displayedItems.length - 1))
            : -1;

    return {
        isSelecting,
        selectedItems,
        copiedLogics,
        displayedItems,
        displayIndex,
        resultLabel: selectedItems.length > 0 ? '선택한 로직' : '복사한 로직',
        setCurrentIndex,
        handleStartSelection,
        handleEndSelection,
        handleCopySelected,
        handlePasteCopied,
        handleDeleteSelected,
    };
}
