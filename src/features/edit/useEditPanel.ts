import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { isExtensionContextValid } from '../../shared/extensionContext';
import { bindTargetMessages, getMessageTarget } from '../../shared/messaging';
import type { NotifyPanel } from '../../shared/panelNotice';
import { usePasteProgress } from '../../shared/pasteProgress';
import { getEditClipboardLogics, setEditClipboardLogics } from '../../shared/storage';
import type { EditSelectionItem, ExtensionMessage } from '../../shared/types/messages';
import type { LogicPastePick } from './pasteTypes';
import { useEditClipboard } from './useEditClipboard';

export function useEditPanel({
    notify,
    clearNotice,
}: {
    notify: NotifyPanel;
    clearNotice(): void;
}) {
    const [messages] = useState(bindTargetMessages);
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedItems, setSelectedItems] = useState<EditSelectionItem[]>([]);
    const [isPasting, setIsPasting] = useState(false);
    const paste = useRef<{ modeId: string; logics: unknown[]; submitted?: boolean } | undefined>(
        undefined,
    );
    const queuedPick = useRef<LogicPastePick | undefined>(undefined);
    const [busy, setBusy] = useState<string>();
    const [progressMode, setProgressMode] = useState<string>();
    const progress = usePasteProgress(messages.sessionId, progressMode, progressMode);
    const mounted = useRef(false);
    const locked = useRef(false);
    const selecting = useRef(false);
    const ignoreIndex = useCallback(() => {}, []);
    const { copiedItems, copiedLogics, applyClipboardState } = useEditClipboard(ignoreIndex);
    const current = () => mounted.current && getMessageTarget() === messages.sessionId;
    const reset = () => {
        paste.current = undefined;
        queuedPick.current = undefined;
        setIsPasting(false);
        selecting.current = false;
        setIsSelecting(false);
        setSelectedItems([]);
    };
    const run = async (label: string, operation: () => Promise<void>) => {
        if (locked.current) return;
        locked.current = true;
        setBusy(label);
        setProgressMode(undefined);
        clearNotice();
        try {
            await operation();
        } catch {
            const modeId = paste.current?.modeId;
            if (modeId) {
                messages.sendQuietly({ action: 'EDIT_STOP', modeId });
                if (current()) reset();
            }
            if (current()) notify('error', '처리 결과를 확인할 수 없습니다. 화면을 확인해 주세요.');
        } finally {
            locked.current = false;
            if (mounted.current) setBusy(undefined);
            const pick = queuedPick.current;
            queuedPick.current = undefined;
            if (pick && current()) submitPaste(pick);
        }
    };
    const handleStartSelection = () =>
        void run('시작 중…', async () => {
            selecting.current = true;
            const res = await messages.send({ action: 'EDIT_START' });
            if (!current()) {
                messages.sendQuietly({ action: 'EDIT_STOP' });
                return;
            }
            if (!res.success) {
                selecting.current = false;
                notify('error', res.error || '선택모드를 시작할 수 없습니다.');
                return;
            }
            selecting.current = true;
            setIsSelecting(true);
            setSelectedItems([]);
        });
    const handleEndSelection = () =>
        void run('종료 중…', async () => {
            const res = await messages.send({ action: 'EDIT_STOP', modeId: paste.current?.modeId });
            if (!current()) return;
            if (res.success) reset();
            else notify('error', res.error || '선택모드를 종료할 수 없습니다.');
        });
    const handleCopySelected = () =>
        void run('복사 중…', async () => {
            if (!selectedItems.length) return;
            const res = await messages.send({
                action: 'EDIT_COPY_SELECTED',
                payload: { logicIds: selectedItems.map((i) => i.logicId) },
            });
            if (!current()) return;
            const logics = res.data?.logics;
            if (!res.success || !logics?.length) {
                notify('error', res.error || '복사할 로직이 없습니다.');
                return;
            }
            try {
                await navigator.clipboard.writeText(JSON.stringify(logics, null, 2));
            } catch {
                /* extension storage is authoritative */
            }
            await setEditClipboardLogics(logics);
            if (!current()) return;
            applyClipboardState(logics);
            await messages.send({ action: 'EDIT_STOP' });
            if (!current()) return;
            reset();
            notify('success', `${logics.length}개 복사했습니다.`);
        });
    const submitPaste = (pick: LogicPastePick) => {
        const snapshot = paste.current;
        if (!snapshot || snapshot.modeId !== pick.modeId || snapshot.submitted || !current())
            return;
        if (locked.current) {
            queuedPick.current = pick;
            return;
        }
        snapshot.submitted = true;
        void run('붙여넣기 중…', async () => {
            setProgressMode(snapshot.modeId);
            const res = await messages.send({
                action: 'EDIT_PASTE_LOGICS',
                payload: { ...pick, logics: snapshot.logics },
            });
            if (!current()) return;
            // Release the input shield even when a stale destination is rejected before mutation.
            await messages.send({ action: 'EDIT_STOP', modeId: snapshot.modeId });
            if (!current()) return;
            reset();
            const data = res.data;
            if (!res.success || data?.setupError) {
                notify(
                    'error',
                    `${data?.createdCount ? `${data.createdCount}개 생성. ` : ''}${res.error || data?.setupError || '붙여넣을 수 없습니다.'}`,
                );
            } else if (data?.validationWarnings) {
                notify(
                    'error',
                    `${data.createdCount}개 붙여넣음 · 일부 로직 검증 실패. 화면을 확인해 주세요.`,
                );
            } else notify('success', `${data?.createdCount ?? 0}개 붙여넣었습니다.`);
        });
    };
    const onPastePicked = useEffectEvent((pick: LogicPastePick) => submitPaste(pick));
    const handlePasteCopied = () =>
        void run('위치 선택 중…', async () => {
            const stored = await getEditClipboardLogics();
            if (!current()) return;
            const logics = stored.length ? stored : copiedLogics;
            if (!logics.length) {
                notify('error', '붙여넣을 로직이 없습니다.');
                return;
            }
            applyClipboardState(logics);
            const modeId = crypto.randomUUID();
            paste.current = { modeId, logics: structuredClone(logics) };
            selecting.current = true;
            const res = await messages.send({ action: 'EDIT_PASTE_START', payload: { modeId } });
            if (!current() || paste.current?.modeId !== modeId) {
                messages.sendQuietly({ action: 'EDIT_STOP', modeId });
                return;
            }
            if (!res.success) {
                reset();
                notify('error', res.error || '위치 선택을 시작할 수 없습니다.');
                return;
            }
            setIsSelecting(true);
            setIsPasting(true);
            setSelectedItems([]);
        });
    const handleDeleteSelected = () =>
        void run('삭제 중…', async () => {
            if (!selectedItems.length) return;
            const res = await messages.send({
                action: 'EDIT_DELETE_SELECTED',
                payload: { logicIds: selectedItems.map((i) => i.logicId) },
            });
            if (!current()) return;
            const data = res.data;
            if (res.success || (data?.deletedCount ?? 0) > 0) {
                reset();
                notify(
                    data?.errors.length ? 'error' : 'success',
                    `${data?.deletedCount ?? 0}개 삭제${data?.errors.length ? ` · ${data.errors.length}개 실패` : ' 완료'}`,
                );
            } else notify('error', res.error || '삭제할 수 없습니다.');
        });
    const handleDeselect = (logicId: string) => {
        if (!locked.current)
            messages.sendQuietly({ action: 'EDIT_DESELECT', payload: { logicId } });
    };
    const handleClearSelection = () => {
        if (!locked.current) messages.sendQuietly({ action: 'EDIT_CLEAR' });
    };
    useEffect(() => {
        mounted.current = true;
        const receive = (msg: ExtensionMessage) => {
            if (msg.action !== 'EDIT_UI_SYNC' || msg.targetSessionId !== messages.sessionId) return;
            if (msg.payload.paste) {
                onPastePicked(msg.payload.paste);
                return;
            }
            if (msg.payload.modeId ? msg.payload.modeId !== paste.current?.modeId : !!paste.current)
                return;
            if (!msg.payload.logicEditActive) {
                paste.current = undefined;
                setIsPasting(false);
            }
            // A slow metadata read must not revive a selection already stopped.
            if (msg.payload.logicEditActive && !selecting.current) return;
            selecting.current = msg.payload.logicEditActive;
            setIsSelecting(msg.payload.logicEditActive);
            if (msg.payload.selectedItems) setSelectedItems(msg.payload.selectedItems);
            if (msg.payload.error) notify('error', msg.payload.error);
        };
        if (isExtensionContextValid()) chrome.runtime.onMessage.addListener(receive);
        return () => {
            mounted.current = false;
            if (selecting.current)
                messages.sendQuietly({ action: 'EDIT_STOP', modeId: paste.current?.modeId });
            paste.current = undefined;
            selecting.current = false;
            try {
                chrome.runtime.onMessage.removeListener(receive);
            } catch {
                /* context unloaded */
            }
        };
    }, [messages, notify]);
    return {
        isSelecting,
        isPasting,
        selectedItems,
        copiedItems,
        busy: busy && isPasting ? (progress ?? busy) : busy,
        handleStartSelection,
        handleEndSelection,
        handleCopySelected,
        handlePasteCopied,
        handleDeleteSelected,
        handleDeselect,
        handleClearSelection,
    };
}
