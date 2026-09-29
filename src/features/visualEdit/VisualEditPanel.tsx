import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { EditWorkspace } from '../../shared/EditWorkspace';
import { isExtensionContextValid } from '../../shared/extensionContext';
import { bindTargetMessages, getMessageTarget } from '../../shared/messaging';
import type { NotifyPanel } from '../../shared/panelNotice';
import { usePasteProgress } from '../../shared/pasteProgress';
import type { ExtensionMessage } from '../../shared/types/messages';
import { getVisualClipboard, isVisualClipboard, VISUAL_CLIPBOARD_KEY } from './clipboard';
import type { VisualClipboard } from './transferTypes';
import type { VisualEditState } from './types';

export function VisualEditPanel({
    notify,
    clearNotice,
}: {
    notify: NotifyPanel;
    clearNotice(): void;
}) {
    const [messages] = useState(bindTargetMessages);
    const [state, setState] = useState<VisualEditState>({ modeId: '', active: false, items: [] });
    const [starting, setStarting] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [transfer, setTransfer] = useState<'copy' | 'paste' | undefined>();
    const [clipboard, setClipboard] = useState<VisualClipboard>();
    const deleteRequest = useRef<string | undefined>(undefined);
    const busy = deleting || !!transfer || !!state.deleting;
    const pasting = state.active && state.purpose === 'paste';
    const mode = useRef<string | undefined>(undefined);
    const [progressRequest, setProgressRequest] = useState<string>();
    const progress = usePasteProgress(messages.sessionId, state.modeId, progressRequest);
    const mounted = useRef(false);
    const generation = useRef(0);
    const submittedPaste = useRef<string | undefined>(undefined);
    const invalidate = useCallback(() => {
        generation.current++;
    }, []);
    useEffect(() => {
        if (!isExtensionContextValid()) return;
        let alive = true,
            changed = false;
        const receive = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'local' || !changes[VISUAL_CLIPBOARD_KEY]) return;
            changed = true;
            const value = changes[VISUAL_CLIPBOARD_KEY].newValue;
            setClipboard(isVisualClipboard(value) ? value : undefined);
        };
        chrome.storage.onChanged.addListener(receive);
        void getVisualClipboard()
            .then((value) => {
                if (alive && !changed) setClipboard(value);
            })
            .catch(() => {
                if (alive) notify('error', '복사 데이터를 불러올 수 없습니다.');
            });
        return () => {
            alive = false;
            try {
                chrome.storage.onChanged.removeListener(receive);
            } catch {
                /* extension unloaded */
            }
        };
    }, [notify]);
    const start = async (forPaste = false) => {
        if (mode.current) return;
        const modeId = crypto.randomUUID();
        mode.current = modeId;
        const requestGeneration = ++generation.current;
        clearNotice();
        setStarting(true);
        try {
            const response = await messages.send(
                forPaste && clipboard
                    ? {
                          action: 'VISUAL_EDIT_PASTE_START',
                          payload: { modeId, clipboardId: clipboard.id },
                      }
                    : {
                          action: 'VISUAL_EDIT_START',
                          payload: { modeId },
                      },
            );
            if (
                !mounted.current ||
                generation.current !== requestGeneration ||
                getMessageTarget() !== messages.sessionId
            )
                return;
            if (!response.success) {
                mode.current = undefined;
                setState({ modeId, active: false, items: [] });
                notify('error', response.error ?? '선택모드를 시작할 수 없습니다.');
            }
        } catch {
            if (mounted.current && generation.current === requestGeneration) {
                mode.current = undefined;
                setState({ modeId, active: false, items: [] });
                messages.sendQuietly({ action: 'VISUAL_EDIT_STOP', payload: { modeId } });
                notify('error', '선택모드 통신 중 오류가 발생했습니다.');
            }
        } finally {
            if (mounted.current && generation.current === requestGeneration) setStarting(false);
        }
    };
    const stop = () => {
        const modeId = mode.current;
        if (!modeId) return;
        generation.current++;
        messages.sendQuietly({ action: 'VISUAL_EDIT_STOP', payload: { modeId } });
        mode.current = undefined;
        setStarting(false);
        setState({ modeId, active: false, items: [] });
    };
    const removeSelected = async () => {
        const modeId = mode.current;
        if (!modeId || !state.active || !state.items.length || deleteRequest.current) return;
        const requestId = crypto.randomUUID();
        const items = state.items;
        const requestGeneration = generation.current;
        deleteRequest.current = requestId;
        setDeleting(true);
        clearNotice();
        try {
            const response = await messages.send({
                action: 'VISUAL_EDIT_DELETE',
                payload: { modeId, requestId, modelIds: items.map((item) => item.id) },
            });
            if (
                !mounted.current ||
                generation.current !== requestGeneration ||
                getMessageTarget() !== messages.sessionId
            )
                return;
            const result = response.data;
            if (!result) {
                notify(
                    'error',
                    response.error ?? '삭제 결과를 확인할 수 없습니다. 현재 화면을 확인해 주세요.',
                );
                return;
            }
            const removed = result.deletedIds.length + result.cascadedIds.length;
            const summary = `${removed}개 삭제`;
            if (!response.success) {
                const failed = items.find((item) => item.id === result.failed?.id);
                notify(
                    'error',
                    `${summary}. ${failed ? `${failed.label || failed.eid || failed.type}: ` : ''}${result.error || response.error || '삭제를 중단했습니다.'} 남은 선택 ${result.remainingIds.length}개.`,
                );
            } else notify('success', `${summary}했습니다.`);
        } catch {
            messages.sendQuietly({ action: 'VISUAL_EDIT_STOP', payload: { modeId } });
            if (mounted.current && generation.current === requestGeneration)
                notify(
                    'error',
                    '삭제 결과를 확인할 수 없습니다. 현재 화면을 확인한 뒤 다시 선택해 주세요.',
                );
        } finally {
            if (deleteRequest.current === requestId) deleteRequest.current = undefined;
            if (mounted.current) setDeleting(false);
        }
    };
    const runTransfer = async (action: 'copy' | 'paste', picked = state) => {
        const modeId = mode.current;
        if (!modeId || !picked.active || !picked.items.length || deleteRequest.current || busy)
            return;
        if (action === 'paste' && !picked.pasteLocation) return;
        if (action === 'paste' && (!clipboard || picked.clipboardId !== clipboard.id)) {
            stop();
            notify('error', '복사 내용이 바뀌었습니다. 붙여넣기를 다시 시작하세요.');
            return;
        }
        const requestId = crypto.randomUUID(),
            requestGeneration = generation.current;
        deleteRequest.current = requestId;
        setProgressRequest(requestId);
        setTransfer(action);
        clearNotice();
        try {
            const payload = { modeId, requestId, modelIds: picked.items.map((item) => item.id) };
            const response = await messages.send(
                action === 'copy'
                    ? { action: 'VISUAL_EDIT_COPY', payload }
                    : {
                          action: 'VISUAL_EDIT_PASTE',
                          payload: {
                              ...payload,
                              clipboardId: clipboard!.id,
                              position: picked.pasteLocation!.position,
                          },
                      },
            );
            if (
                !mounted.current ||
                generation.current !== requestGeneration ||
                getMessageTarget() !== messages.sessionId
            )
                return;
            if (!response.success) {
                if (action === 'paste' && !response.data?.records) stop();
                const count = response.data?.createdIds?.length ?? 0;
                notify(
                    'error',
                    `${count ? `${count}개 붙여넣기 후 중단했습니다. ` : ''}${response.error ?? '처리 결과를 확인할 수 없습니다.'}`,
                );
            } else if (action === 'copy') {
                if (response.data?.clipboard) setClipboard(response.data.clipboard);
                notify(
                    'success',
                    `${response.data?.clipboard?.roots.length ?? state.items.length}개 복사했습니다.`,
                );
            } else notify('success', `${response.data?.createdIds?.length ?? 0}개 붙여넣었습니다.`);
        } catch {
            messages.sendQuietly({ action: 'VISUAL_EDIT_STOP', payload: { modeId } });
            if (mounted.current && generation.current === requestGeneration)
                notify(
                    'error',
                    '처리 결과를 확인할 수 없습니다. 현재 화면을 확인한 뒤 다시 선택해 주세요.',
                );
        } finally {
            if (deleteRequest.current === requestId) deleteRequest.current = undefined;
            if (mounted.current) setTransfer(undefined);
        }
    };
    const onPastePicked = useEffectEvent((picked: VisualEditState) => {
        if (
            !picked.active ||
            picked.purpose !== 'paste' ||
            !picked.pasteLocation ||
            picked.deleting ||
            submittedPaste.current === picked.modeId
        )
            return;
        submittedPaste.current = picked.modeId;
        void runTransfer('paste', picked);
    });
    useEffect(() => {
        mounted.current = true;
        const receive = (message: ExtensionMessage) => {
            if (
                message.action !== 'VISUAL_EDIT_STATE' ||
                message.targetSessionId !== messages.sessionId ||
                message.payload.modeId !== mode.current
            )
                return;
            setState(message.payload);
            onPastePicked(message.payload);
            if (!message.payload.active) {
                mode.current = undefined;
                setStarting(false);
                if (message.payload.notice) notify('info', message.payload.notice);
            }
        };
        if (isExtensionContextValid()) chrome.runtime.onMessage.addListener(receive);
        return () => {
            mounted.current = false;
            invalidate();
            if (mode.current)
                messages.sendQuietly({
                    action: 'VISUAL_EDIT_STOP',
                    payload: { modeId: mode.current },
                });
            mode.current = undefined;
            try {
                chrome.runtime.onMessage.removeListener(receive);
            } catch {
                /* extension unloaded */
            }
        };
    }, [messages, notify, invalidate]);
    return (
        <EditWorkspace
            active={state.active}
            pasting={pasting}
            busy={
                starting
                    ? '시작 중…'
                    : busy
                      ? ((transfer === 'paste' ? progress : undefined) ??
                        `${(transfer ?? state.operation) === 'copy' ? '복사' : (transfer ?? state.operation) === 'paste' ? '붙여넣기' : '삭제'} 중…`)
                      : undefined
            }
            items={
                pasting
                    ? []
                    : state.items.map((item) => ({
                          key: item.id,
                          type: item.kind === 'grid' ? 'Grid' : item.type,
                          label: item.label.trim(),
                          id: item.eid,
                          hidden: item.includesHidden,
                      }))
            }
            copied={(clipboard?.roots ?? []).map((item, index) => ({
                key: String(index),
                type: item.type,
                label: item.label.trim(),
                id: item.eid,
            }))}
            notice={state.active ? state.notice : undefined}
            onStart={() => void start()}
            onStop={stop}
            onCopy={() => void runTransfer('copy')}
            onDelete={() => void removeSelected()}
            onPaste={() => void start(true)}
            onClear={() => {
                if (mode.current)
                    messages.sendQuietly({
                        action: 'VISUAL_EDIT_CLEAR',
                        payload: { modeId: mode.current },
                    });
            }}
            onDeselect={(modelId) => {
                if (mode.current)
                    messages.sendQuietly({
                        action: 'VISUAL_EDIT_DESELECT',
                        payload: { modeId: mode.current, modelId },
                    });
            }}
        />
    );
}
