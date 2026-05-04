import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { PanelNotice } from './panelNotice';

interface PanelNoticeBarProps {
    notice: PanelNotice;
    onClose: () => void;
}

export function PanelNoticeBar({ notice, onClose }: PanelNoticeBarProps) {
    const Icon =
        notice.kind === 'success'
            ? CheckCircle2
            : notice.kind === 'error'
              ? XCircle
              : Info;

    return (
        <div className={`panel-notice panel-notice--${notice.kind}`}>
            <Icon className="panel-notice__icon" size={14} />
            <span className="panel-notice__message">{notice.message}</span>
            <button
                type="button"
                className="panel-notice__close"
                onClick={onClose}
                aria-label="알림 닫기"
            >
                <X size={13} />
            </button>
        </div>
    );
}
