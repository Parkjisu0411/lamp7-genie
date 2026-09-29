import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isExtensionContextValid } from '../shared/extensionContext';
import { sendRuntimeMessageSafely, setMessageTarget } from '../shared/messaging';
import type { TargetContext } from '../shared/targets/types';
import type { ExtensionMessage } from '../shared/types/messages';
import { FloatingPanel } from './FloatingPanel';

export function bootstrapTopFramePanel(): void {
    let isVisible = false;
    let focusSearchSignal = 0;
    let target: TargetContext | null = null;
    let receivedTargetUpdate = false;

    const container = document.createElement('div');
    container.id = 'lamp7-genie-root';
    document.body.appendChild(container);

    const root = createRoot(container);

    function render() {
        root.render(
            <StrictMode>
                <FloatingPanel
                    key={target?.sessionId ?? 'unavailable'}
                    isVisible={isVisible}
                    focusSearchSignal={focusSearchSignal}
                    target={target}
                />
            </StrictMode>,
        );
    }

    render();

    sendRuntimeMessageSafely({ action: 'REQUEST_TARGET_AVAILABILITY' }, (res) => {
        if (!receivedTargetUpdate && typeof res?.data?.available === 'boolean') {
            target = res.data.target;
            setMessageTarget(target?.sessionId);
            if (!target) isVisible = false;
            render();
        }
    });

    if (!isExtensionContextValid()) return;
    chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
        if (!isExtensionContextValid()) return;
        if (message.action === 'TARGET_AVAILABILITY') {
            receivedTargetUpdate = true;
            target = message.payload.target;
            setMessageTarget(target?.sessionId);
            if (!target) isVisible = false;
            render();
            return;
        }
        if (message.action === 'HIDE_PANEL') {
            isVisible = false;
            render();
            return;
        }
        if (message.action === 'TOGGLE_PANEL') {
            if (!target || message.targetSessionId !== target.sessionId) return;
            isVisible = !isVisible;
            if (!isVisible) {
                sendRuntimeMessageSafely({ action: 'EDIT_STOP' });
            }
            render();
            return;
        }
        if (message.action === 'FOCUS_SEARCH') {
            if (!target || message.targetSessionId !== target.sessionId) return;
            isVisible = true;
            focusSearchSignal += 1;
            render();
        }
    });
}
