import { Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';
import type {
    EditUiSyncPayload,
    ExtensionMessage,
    ExtensionResponse,
} from '../../shared/types/messages';

interface ClipboardPanelProps {
    eventSettingAvailable: boolean;
}

export function ClipboardPanel({ eventSettingAvailable }: ClipboardPanelProps) {
    const [isSelecting, setIsSelecting] = useState(false);
    const [lastError, setLastError] = useState<string | null>(null);

    useEffect(() => {
        const onMsg = (msg: ExtensionMessage) => {
            if (msg.action === 'EDIT_UI_SYNC') {
                const p = msg.payload as EditUiSyncPayload | undefined;
                if (p && typeof p.logicEditActive === 'boolean') {
                    setIsSelecting(p.logicEditActive);
                }
            }
        };
        chrome.runtime.onMessage.addListener(onMsg);
        return () => chrome.runtime.onMessage.removeListener(onMsg);
    }, []);

    const handleStartSelection = () => {
        setLastError(null);
        chrome.runtime.sendMessage(
            { action: 'EDIT_START' } satisfies ExtensionMessage,
            (res: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    setLastError(chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                if (res?.success) {
                    setIsSelecting(true);
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
        chrome.runtime.sendMessage(
            { action: 'EDIT_STOP' } satisfies ExtensionMessage,
            () => {
                if (chrome.runtime.lastError) {
                    setLastError(chrome.runtime.lastError.message ?? '통신 오류');
                    return;
                }
                setIsSelecting(false);
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
            <div className="panel__notice">
                {lastError ? (
                    <span className="panel__hint panel__hint--error">{lastError}</span>
                ) : isSelecting ? (
                    '페이지 왼쪽 seq 열에서 클릭·Shift+클릭·드래그로 선택합니다. 드래그 경로를 지나는 줄은 선택/비선택이 토글됩니다. Esc·패널 닫기·접기·페이지 이동 시에도 모드가 꺼집니다. 또는 선택 종료를 누르세요.'
                ) : (
                    '선택 시작을 누르면 eventSetting 화면의 seq 열에 선택 핸들이 나타납니다.'
                )}
            </div>
        </div>
    );
}
