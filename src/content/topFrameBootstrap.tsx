import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { isExtensionContextValid } from '../shared/extensionContext';
import { sendRuntimeMessageSafely } from '../shared/messaging';
import type { ExtensionMessage } from '../shared/types/messages';
import { FloatingPanel } from './FloatingPanel';

export function bootstrapTopFramePanel(): void {
    let isVisible = false;
    let focusSearchSignal = 0;
    let eventSettingAvailable = false;

    const container = document.createElement('div');
    container.id = 'lamp7-genie-root';
    document.body.appendChild(container);

    const root = createRoot(container);

    function render() {
        root.render(
            <StrictMode>
                <FloatingPanel
                    isVisible={isVisible}
                    focusSearchSignal={focusSearchSignal}
                    eventSettingAvailable={eventSettingAvailable}
                />
            </StrictMode>,
        );
    }

    render();

    sendRuntimeMessageSafely({ action: 'REQUEST_TARGET_AVAILABILITY' }, (res) => {
        if (typeof res?.data?.available === 'boolean') {
            eventSettingAvailable = res.data.available;
            render();
        }
    });

    if (!isExtensionContextValid()) return;
    chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
        if (!isExtensionContextValid()) return;
        if (message.action === 'TARGET_AVAILABILITY') {
            eventSettingAvailable = message.payload.available;
            render();
            return;
        }
        if (message.action === 'HIDE_PANEL') {
            isVisible = false;
            render();
            return;
        }
        if (message.action === 'TOGGLE_PANEL') {
            isVisible = !isVisible;
            if (!isVisible) {
                sendRuntimeMessageSafely({ action: 'EDIT_STOP' });
            }
            render();
            return;
        }
        if (message.action === 'FOCUS_SEARCH') {
            isVisible = true;
            focusSearchSignal += 1;
            render();
        }
    });
}
