export const HIGHLIGHT_CLASS = 'genie-highlight';
export const HIGHLIGHT_ACTIVE_CLASS = 'genie-highlight--active';
export const HIGHLIGHT_STYLE_ID = 'genie-highlight-style';

// MAIN world(queryFrameData)에서 매칭된 DOM에 부여하고,
// ISOLATED world(content script)에서 셀렉터로 찾을 때 쓰는 data attribute.
export const DATA_ATTR_TARGET_ID = 'data-genie-target-id';

/**
 * MAIN world에서 $.divTab('.logic_area') 등으로 찾은 편집용 영역을 표시.
 * EDIT_STOP 시 제거한다.
 */
export const DATA_ATTR_LOGIC_AREA_PIN = 'data-genie-logic-area-pin';
