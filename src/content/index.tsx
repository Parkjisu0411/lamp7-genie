import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type {
    ExtensionMessage,
    ExtensionResponse,
    HighlightTargetsPayload,
    SearchNavigatePayload,
    TargetAvailabilityPayload,
} from '../shared/types/messages';
import { clearLogicAreaPin, mountEdit, unmountEdit } from '../features/edit';
import {
    activateHighlightById,
    applyHighlights,
    clearHighlights,
} from '../features/search';
import { isExtensionContextValid } from '../shared/extensionContext';
import { FloatingPanel } from './FloatingPanel.tsx';
import './content.css';

const isTopFrame = window === window.top;

function safeSendMessage(
    message: ExtensionMessage,
    responseCallback?: (res: ExtensionResponse | undefined) => void,
): void {
    if (!isExtensionContextValid()) return;
    try {
        if (responseCallback) {
            chrome.runtime.sendMessage(message, (res: ExtensionResponse | undefined) => {
                void chrome.runtime.lastError;
                responseCallback(res);
            });
        } else {
            chrome.runtime.sendMessage(message, () => void chrome.runtime.lastError);
        }
    } catch {
        /* Extension context invalidated */
    }
}

// ────────────────────────────────────────────────────────────
// 상위 프레임(content container): FloatingPanel 렌더 + TOGGLE_PANEL 수신
// ────────────────────────────────────────────────────────────
if (isTopFrame) {
    let isVisible = false;
    let focusSearchSignal = 0;
    /** eventSetting iframe 없으면 미니(패널 열기) 버튼 자체를 렌더하지 않음 */
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

    function requestInitialAvailability() {
        safeSendMessage({ action: 'REQUEST_TARGET_AVAILABILITY' }, (res) => {
            const data = res?.data as { available?: boolean } | undefined;
            if (typeof data?.available === 'boolean') {
                eventSettingAvailable = data.available;
                render();
            }
        });
    }

    requestInitialAvailability();

    if (isExtensionContextValid()) {
        chrome.runtime.onMessage.addListener((message: ExtensionMessage) => {
            if (!isExtensionContextValid()) return;
            if (message.action === 'TARGET_AVAILABILITY') {
                const payload = message.payload as TargetAvailabilityPayload | undefined;
                if (payload && typeof payload.available === 'boolean') {
                    eventSettingAvailable = payload.available;
                    render();
                }
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
                    safeSendMessage({ action: 'EDIT_STOP' });
                }
                render();
                return;
            }
            if (message.action === 'FOCUS_SEARCH') {
                isVisible = true;
                focusSearchSignal += 1;
                render();
                return;
            }
        });
    }
}

// ────────────────────────────────────────────────────────────
// 모든 프레임 공통: 하이라이트 관련 메시지 수신
// ────────────────────────────────────────────────────────────
if (isExtensionContextValid()) {
    chrome.runtime.onMessage.addListener(
        (message: ExtensionMessage, _sender, sendResponse) => {
            if (!isExtensionContextValid()) return;
            if (message.action === 'HIGHLIGHT_TARGETS') {
                const payload = message.payload as HighlightTargetsPayload | undefined;
                const matches = payload?.matches ?? [];
                applyHighlights(matches);
                sendResponse({
                    success: true,
                    data: { count: matches.length, matches },
                } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'SEARCH_NAVIGATE') {
                const matchId = (message.payload as SearchNavigatePayload | undefined)
                    ?.matchId;
                if (typeof matchId === 'string') {
                    activateHighlightById(matchId);
                    sendResponse({ success: true } satisfies ExtensionResponse);
                } else {
                    sendResponse({
                        success: false,
                        error: 'matchId가 없습니다.',
                    } satisfies ExtensionResponse);
                }
                return true;
            }

            if (message.action === 'SEARCH_CLEAR') {
                clearHighlights();
                sendResponse({ success: true } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'EDIT_START') {
                const ok = mountEdit();
                if (!ok) clearLogicAreaPin();
                sendResponse({
                    success: ok,
                    error: ok
                        ? undefined
                        : 'seq 편집 영역(표식 근처의 .logic_seq_area / ul > li)을 찾을 수 없습니다.',
                } satisfies ExtensionResponse);
                return true;
            }

            if (message.action === 'EDIT_STOP') {
                unmountEdit({ notifyInactive: true });
                sendResponse({ success: true } satisfies ExtensionResponse);
                return true;
            }
        },
    );
}

window.addEventListener('pagehide', () => {
    unmountEdit();
});
