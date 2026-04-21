import { ClipboardPaste, Copy, Play, Square } from 'lucide-react';
import { useEffect, useState } from 'react';

export function ClipboardPanel() {
    const [isSelecting, setIsSelecting] = useState(false);
    const [selectedText, setSelectedText] = useState('');
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        if (!isSelecting) return;

        const handleMouseUp = () => {
            const selection = window.getSelection();
            const text = selection?.toString().trim();
            if (text) setSelectedText(text);
        };

        document.addEventListener('mouseup', handleMouseUp);
        return () => document.removeEventListener('mouseup', handleMouseUp);
    }, [isSelecting]);

    const handleStartSelection = () => {
        setIsSelecting(true);
        setSelectedText('');
    };

    const handleEndSelection = () => {
        setIsSelecting(false);
    };

    const handleCopy = async () => {
        if (!selectedText) return;
        await navigator.clipboard.writeText(selectedText);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handlePaste = async () => {
        const text = await navigator.clipboard.readText();
        setSelectedText(text);
    };

    return (
        <div className="panel">
            <div className="panel__row">
                <button
                    onClick={handleStartSelection}
                    disabled={isSelecting}
                    className="panel__btn panel__btn--success"
                    style={{ flex: 1 }}
                >
                    <Play size={14} />
                    선택 시작
                </button>
                <button
                    onClick={handleEndSelection}
                    disabled={!isSelecting}
                    className="panel__btn panel__btn--danger"
                    style={{ flex: 1 }}
                >
                    <Square size={14} />
                    선택 종료
                </button>
            </div>

            <div className="panel__notice">
                {isSelecting
                    ? '선택 모드 활성화됨. 텍스트를 드래그하여 선택하세요.'
                    : '선택 시작 버튼을 누른 후 페이지에서 텍스트를 드래그하세요.'}
            </div>

            <div>
                <p className="panel__selection-label">선택된 텍스트</p>
                <div className="panel__selection-box">
                    {isSelecting && !selectedText && (
                        <div className="panel__selecting-indicator">선택 중...</div>
                    )}
                    {selectedText ? (
                        <div className="panel__selection-item">{selectedText}</div>
                    ) : (
                        !isSelecting && (
                            <p className="panel__hint" style={{ padding: '8px 0' }}>
                                선택된 텍스트가 없습니다
                            </p>
                        )
                    )}
                </div>
            </div>

            <div className="panel__row">
                <button
                    onClick={handleCopy}
                    disabled={!selectedText}
                    className="panel__btn panel__btn--primary"
                    style={{ flex: 1 }}
                >
                    <Copy size={14} />
                    {copied ? '복사됨 ✓' : '복사'}
                </button>
                <button onClick={handlePaste} className="panel__btn" style={{ flex: 1 }}>
                    <ClipboardPaste size={14} />
                    붙여넣기
                </button>
            </div>
        </div>
    );
}
