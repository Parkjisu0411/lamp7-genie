import { CheckCircle2, Info, X, XCircle } from 'lucide-react';
import type { PanelNotice } from '../shared/panelNotice';

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
    const isError = notice.kind === 'error';

    return (
        <div
            className={`panel-notice panel-notice--${notice.kind}`}
            role={isError ? 'alert' : 'status'}
            aria-live={isError ? 'assertive' : 'polite'}
        >
            <Icon className="panel-notice__icon" size={14} aria-hidden="true" />
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
