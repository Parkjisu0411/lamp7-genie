import type {
    EditDeleteSelectedPayload,
    EditPasteLogicsPayload,
    EditSelectionChangedPayload,
    EditUiSyncPayload,
    ExtensionMessage,
    ExtensionResponse,
    HighlightTargetsPayload,
    SearchStartPayload,
    SearchStartResponseData,
} from '../shared/types/messages';
import { pasteCopiedLogics } from '../features/edit/background/pasteCopiedLogics';
import { pinLogicAreaMainWorld } from '../features/edit/background/pinLogicAreaMainWorld';
import { removeSelectedLogics } from '../features/edit/background/removeSelectedLogics';
import { resolveSelectedLogics } from '../features/edit/background/resolveSelectedLogics';
import { queryFrameData } from '../features/search/background/queryFrameData';
import { resolveTargetFrame } from '../features/search/background/resolveTargetFrame';

/**
 * top frame content에 메시지 전달. 수신측 없음( about:blank, chrome://, CS 미주입 등 )일 때
 * 콜백 생략형 sendMessage는 Promise reject → try/catch로 잡히지 않아 서비스 워커에
 * Uncaught (in promise) 가 남는다. await 로 처리한다.
 */
async function safeSendToTopFrame(
    tabId: number,
    message: ExtensionMessage,
): Promise<void> {
    try {
        await chrome.tabs.sendMessage(tabId, message, { frameId: 0 });
    } catch {
        /* noop */
    }
}

// ────────────────────────────────────────────────────────────
// eventSetting 타겟 프레임 유무 → 툴팁 + top frame(미니 버튼·패널 표시 동기화)
// 플로팅「패널 열기」는 unavailable 이면 렌더하지 않음(disabled 회색 아님).
// ────────────────────────────────────────────────────────────
async function syncTabTargetState(tabId: number) {
    const target = await resolveTargetFrame(tabId);
    const available = !!target;
    chrome.action.setTitle({
        tabId,
        title: available
            ? 'Lamp7 Genie'
            : 'Lamp7 Genie (eventSetting 화면에서 사용 가능)',
    });
    await safeSendToTopFrame(tabId, {
        action: 'TARGET_AVAILABILITY',
        payload: { available },
    });
    if (!available) {
        await dismissPanelAndStopEdit(tabId);
    }
}

const debouncedSyncByTab = new Map<number, ReturnType<typeof setTimeout>>();

function scheduleSyncTabTargetState(tabId: number) {
    const prev = debouncedSyncByTab.get(tabId);
    if (prev !== undefined) clearTimeout(prev);
    const t = setTimeout(() => {
        debouncedSyncByTab.delete(tabId);
        void syncTabTargetState(tabId);
    }, 120);
    debouncedSyncByTab.set(tabId, t);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete' || typeof changeInfo.url === 'string') {
        scheduleSyncTabTargetState(tabId);
    }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
    void syncTabTargetState(tabId);
});

// 메인 프레임 네비게이션(SPA pushState 등 포함)마다 타겟 재판별
chrome.webNavigation.onHistoryStateUpdated.addListener((details) => {
    if (details.frameId !== 0) return;
    scheduleSyncTabTargetState(details.tabId);
});

chrome.webNavigation.onCommitted.addListener((details) => {
    if (details.frameId !== 0) return;
    scheduleSyncTabTargetState(details.tabId);
});

// eventSetting iframe 이 메인 로드보다 늦게 붙는 경우, 메인(frame 0)만 감지하면
// 첫 sync 에서만 계속 null → UI 가 영구 비활성으로 남을 수 있음.
// 모든 프레임 로드 완료 시마다(디바운스) 다시 판별한다.
chrome.webNavigation.onCompleted.addListener((details) => {
    scheduleSyncTabTargetState(details.tabId);
});

// ────────────────────────────────────────────────────────────
// 툴바(확장 프로그램) 아이콘 클릭
// - eventSetting 있으면: 패널 토글
// - 없으면: 플로팅 닫기 + 상태 동기화(사용자가 다른 화면으로 이동한 뒤에도 닫을 수 있게)
// ────────────────────────────────────────────────────────────
chrome.action.onClicked.addListener((tab) => {
    if (!tab.id) return;
    void (async () => {
        const target = await resolveTargetFrame(tab.id!);
        if (!target) {
            await syncTabTargetState(tab.id!);
            return;
        }
        await safeSendToTopFrame(tab.id!, { action: 'TOGGLE_PANEL' });
    })();
});

// ────────────────────────────────────────────────────────────
// 키보드 단축키 → eventSetting 있을 때만 FOCUS_SEARCH
// 없으면 TARGET_AVAILABILITY + HIDE_PANEL 로 플로팅·미니 버튼 정리
// ────────────────────────────────────────────────────────────
chrome.commands.onCommand.addListener(async (command) => {
    if (command !== 'focus-search') return;
    try {
        const [activeTab] = await chrome.tabs.query({
            active: true,
            currentWindow: true,
        });
        if (!activeTab?.id) return;
        const target = await resolveTargetFrame(activeTab.id);
        if (!target) {
            await syncTabTargetState(activeTab.id);
            return;
        }
        await safeSendToTopFrame(activeTab.id, { action: 'FOCUS_SEARCH' });
    } catch {
        // content script가 로드되지 않은 탭이면 조용히 무시
    }
});

// ────────────────────────────────────────────────────────────
// sendMessage를 Promise로 감싸는 유틸
// ────────────────────────────────────────────────────────────
function sendToFrame(
    tabId: number,
    frameId: number,
    message: ExtensionMessage,
): Promise<ExtensionResponse> {
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(
            tabId,
            message,
            { frameId },
            (response: ExtensionResponse | undefined) => {
                if (chrome.runtime.lastError) {
                    resolve({
                        success: false,
                        error: chrome.runtime.lastError.message,
                    });
                    return;
                }
                resolve(response ?? { success: true });
            },
        );
    });
}

/** 선택·편집 세션 정리(가능한 경우) + 플로팅 패널 숨김 */
async function dismissPanelAndStopEdit(tabId: number): Promise<void> {
    const target = await resolveTargetFrame(tabId);
    if (target) {
        await sendToFrame(tabId, target.frameId, { action: 'EDIT_STOP' });
    }
    await safeSendToTopFrame(tabId, { action: 'HIDE_PANEL' });
}

// ────────────────────────────────────────────────────────────
// 검색 메시지 라우팅
// 흐름:
//   SearchPanel (top frame) ──SEARCH_START──▶ background
//     background: resolveTargetFrame → queryFrameData(MAIN world)
//       → DOMs에 data-genie-target-id 부여, SearchMatch[] 수신
//     background ──HIGHLIGHT_TARGETS──▶ target iframe (ISOLATED)
//       → content script가 applyHighlights 실행
//   background ──응답──▶ SearchPanel
// ────────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener(
    (message: ExtensionMessage, sender, sendResponse) => {
        if (message.action === 'REQUEST_TARGET_AVAILABILITY') {
            const tid = sender.tab?.id;
            if (!tid) return;
            void (async () => {
                const target = await resolveTargetFrame(tid);
                sendResponse({
                    success: true,
                    data: { available: !!target },
                } satisfies ExtensionResponse);
            })();
            return true;
        }

        const tabId = sender.tab?.id;
        if (!tabId) return;

        if (message.action === 'SEARCH_START') {
            (async () => {
                const target = await resolveTargetFrame(tabId);
                if (!target) {
                    console.warn(
                        '[lamp7-genie] target frame not found — eventSetting 화면이 아닙니다.',
                        { tabId },
                    );
                    sendResponse({
                        success: false,
                        error: 'eventSetting 화면이 아닙니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const payload = message.payload as SearchStartPayload | undefined;
                if (!payload || typeof payload.query !== 'string') {
                    sendResponse({
                        success: false,
                        error: '검색어가 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const matches = await queryFrameData(
                    tabId,
                    target.frameId,
                    payload,
                );
                if (!matches) {
                    sendResponse({
                        success: false,
                        error: 'LogicEditor 접근에 실패했습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                // 타겟 iframe의 content script에 하이라이트 지시
                const highlightMsg: ExtensionMessage = {
                    action: 'HIGHLIGHT_TARGETS',
                    payload: { matches } satisfies HighlightTargetsPayload,
                };
                const highlightRes = await sendToFrame(
                    tabId,
                    target.frameId,
                    highlightMsg,
                );
                if (!highlightRes.success) {
                    sendResponse({
                        success: false,
                        error: highlightRes.error ?? '하이라이트 실패',
                    } satisfies ExtensionResponse);
                    return;
                }

                const data: SearchStartResponseData = {
                    count: matches.length,
                    matches,
                };
                sendResponse({
                    success: true,
                    data,
                } satisfies ExtensionResponse);
            })();
            return true;
        }

        if (
            message.action === 'SEARCH_NAVIGATE' ||
            message.action === 'SEARCH_CLEAR'
        ) {
            (async () => {
                const target = await resolveTargetFrame(tabId);
                // 타겟이 없어도 SEARCH_CLEAR는 조용히 성공 처리 (언마운트 시 호출 대비)
                if (!target) {
                    sendResponse(
                        message.action === 'SEARCH_CLEAR'
                            ? { success: true }
                            : {
                                  success: false,
                                  error: 'eventSetting 화면이 아닙니다.',
                              },
                    );
                    return;
                }
                const res = await sendToFrame(tabId, target.frameId, message);
                sendResponse(res);
            })();
            return true;
        }

        if (message.action === 'GENIE_DISMISS') {
            (async () => {
                await dismissPanelAndStopEdit(tabId);
                sendResponse({ success: true } satisfies ExtensionResponse);
            })();
            return true;
        }

        if (message.action === 'EDIT_START' || message.action === 'EDIT_STOP') {
            (async () => {
                const target = await resolveTargetFrame(tabId);
                if (!target) {
                    sendResponse({
                        success: false,
                        error: 'eventSetting 화면이 아닙니다.',
                    } satisfies ExtensionResponse);
                    return;
                }
                if (message.action === 'EDIT_START') {
                    const pinRes = await pinLogicAreaMainWorld(tabId, target.frameId);
                    if (pinRes.ok === false) {
                        sendResponse({
                            success: false,
                            error: pinRes.error,
                        } satisfies ExtensionResponse);
                        return;
                    }
                }
                const res = await sendToFrame(tabId, target.frameId, message);
                sendResponse(res);
            })();
            return true;
        }

        if (message.action === 'EDIT_NOTIFY_INACTIVE') {
            void safeSendToTopFrame(tabId, {
                action: 'EDIT_UI_SYNC',
                payload: {
                    logicEditActive: false,
                    selectedItems: [],
                } satisfies EditUiSyncPayload,
            });
            sendResponse({ success: true } satisfies ExtensionResponse);
            return true;
        }

        if (message.action === 'EDIT_SELECTION_CHANGED') {
            (async () => {
                const frameId = sender.frameId;
                if (typeof frameId !== 'number') {
                    sendResponse({
                        success: false,
                        error: '편집 대상 프레임을 알 수 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const payload = message.payload as EditSelectionChangedPayload | undefined;
                const logicIds = Array.isArray(payload?.logicIds)
                    ? payload.logicIds.filter((id): id is string => typeof id === 'string')
                    : [];
                const selectedItems = await resolveSelectedLogics(
                    tabId,
                    frameId,
                    logicIds,
                );
                if (!selectedItems) {
                    await safeSendToTopFrame(tabId, {
                        action: 'EDIT_UI_SYNC',
                        payload: {
                            logicEditActive: true,
                            selectedItems: [],
                            error: '선택한 로직 정보를 읽을 수 없습니다. 선택을 다시 시도하세요.',
                        } satisfies EditUiSyncPayload,
                    });
                    sendResponse({
                        success: false,
                        error: '선택된 로직 정보를 읽을 수 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                await safeSendToTopFrame(tabId, {
                    action: 'EDIT_UI_SYNC',
                    payload: {
                        logicEditActive: true,
                        selectedItems,
                        error: payload?.error,
                    } satisfies EditUiSyncPayload,
                });
                sendResponse({
                    success: true,
                    data: { count: selectedItems.length },
                } satisfies ExtensionResponse);
            })();
            return true;
        }

        if (message.action === 'EDIT_DELETE_SELECTED') {
            (async () => {
                const target = await resolveTargetFrame(tabId);
                if (!target) {
                    sendResponse({
                        success: false,
                        error: 'eventSetting 화면이 아닙니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const payload = message.payload as EditDeleteSelectedPayload | undefined;
                const logicIds = Array.isArray(payload?.logicIds)
                    ? payload.logicIds.filter((id): id is string => typeof id === 'string')
                    : [];
                if (logicIds.length === 0) {
                    sendResponse({
                        success: false,
                        error: '삭제할 로직이 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const data = await removeSelectedLogics(
                    tabId,
                    target.frameId,
                    logicIds,
                );
                if (!data) {
                    sendResponse({
                        success: false,
                        error: 'LogicEditor.removeLogic을 사용할 수 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                await sendToFrame(tabId, target.frameId, { action: 'EDIT_STOP' });
                await safeSendToTopFrame(tabId, {
                    action: 'EDIT_UI_SYNC',
                    payload: {
                        logicEditActive: false,
                        selectedItems: [],
                    } satisfies EditUiSyncPayload,
                });

                sendResponse({
                    success: data.errors.length === 0,
                    data,
                    error: data.errors.length > 0 ? '일부 로직 삭제에 실패했습니다.' : undefined,
                } satisfies ExtensionResponse);
            })();
            return true;
        }

        if (message.action === 'EDIT_PASTE_LOGICS') {
            (async () => {
                const target = await resolveTargetFrame(tabId);
                if (!target) {
                    sendResponse({
                        success: false,
                        error: 'eventSetting 화면이 아닙니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const payload = message.payload as EditPasteLogicsPayload | undefined;
                const logics = Array.isArray(payload?.logics) ? payload.logics : [];
                if (logics.length === 0) {
                    sendResponse({
                        success: false,
                        error: '붙여넣을 로직이 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }

                const data = await pasteCopiedLogics(tabId, target.frameId, logics);
                if (!data) {
                    sendResponse({
                        success: false,
                        error: '붙여넣기 실행 환경에 접근할 수 없습니다.',
                    } satisfies ExtensionResponse);
                    return;
                }
                if (data.setupError) {
                    sendResponse({
                        success: false,
                        data,
                        error: data.setupError,
                    } satisfies ExtensionResponse);
                    return;
                }

                await sendToFrame(tabId, target.frameId, { action: 'EDIT_STOP' });
                await safeSendToTopFrame(tabId, {
                    action: 'EDIT_UI_SYNC',
                    payload: {
                        logicEditActive: false,
                        selectedItems: [],
                    } satisfies EditUiSyncPayload,
                });

                sendResponse({
                    success: data.errors.length === 0,
                    data,
                    error: data.errors.length > 0 ? '일부 로직 붙여넣기에 실패했습니다.' : undefined,
                } satisfies ExtensionResponse);
            })();
            return true;
        }
    },
);
