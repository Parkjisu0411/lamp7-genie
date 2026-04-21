export const HIGHLIGHT_CLASS = 'genie-highlight';
export const HIGHLIGHT_ACTIVE_CLASS = 'genie-highlight--active';
export const HIGHLIGHT_STYLE_ID = 'genie-highlight-style';

// MAIN world(queryFrameData)에서 매칭된 DOM에 부여하고,
// ISOLATED world(content script)에서 셀렉터로 찾을 때 쓰는 data attribute.
export const DATA_ATTR_TARGET_ID = 'data-genie-target-id';

// 검색 기능이 활성화되어야 하는 iframe URL pathname
// /s/<orgKey>/<tenantKey>/screens/event/eventSetting 형태에서
// 앞의 동적 key와 무관하게 pathname이 이 경로로 정확히 끝나야 매치
export const TARGET_FRAME_PATH = '/screens/event/eventSetting';

// 대상 프레임 MAIN world에서 접근할 메모리 객체의 dotted path.
// 예: 'myApp.screen.events' → window.myApp.screen.events
// 빈 문자열이면 SEARCH_START에서 window 전역 덤프(dumpFrameGlobals)를 대신 수행해
// 후보를 찾을 수 있게 한다.
export const MEMORY_OBJECT_PATH = 'LogicEditor';

/** 로직 목록 편집(다중 선택) — content script에서 seq/행에 부여 */
export const EDIT_STYLE_ID = 'genie-edit-style';
export const EDIT_WRAP_ACTIVE_CLASS = 'genie-edit-wrap--active';
export const EDIT_SELECTED_CLASS = 'genie-edit--selected';

/**
 * MAIN world에서 $.divTab('.logic_area') 등으로 찾은 편집용 영역을 표시.
 * EDIT_STOP 시 제거한다.
 */
export const DATA_ATTR_LOGIC_AREA_PIN = 'data-genie-logic-area-pin';
