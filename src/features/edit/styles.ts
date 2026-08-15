import {
    EDIT_SELECTED_CLASS,
    EDIT_STYLE_ID,
    EDIT_WRAP_ACTIVE_CLASS,
} from '../../shared/constants';

export function injectEditStyles(doc: Document = document): void {
    if (doc.getElementById(EDIT_STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = EDIT_STYLE_ID;
    style.textContent = `
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area ul {
  user-select: none;
}
/* 중첩 ul이 있어도 실제 행(자손 li 없음)에만 핸들 — dom.listSeqItems와 동일 기준 */
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area li:not(:has(li)) {
  position: relative;
  padding-left: 22px;
  cursor: pointer;
  box-sizing: border-box;
}
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area li:not(:has(li))::before {
  content: '';
  position: absolute;
  left: 6px;
  top: 50%;
  transform: translateY(-50%);
  width: 7px;
  height: 7px;
  border-radius: 50%;
  box-sizing: border-box;
  border: 1px solid #b8c9f8;
  background: #e8f0ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.12);
}
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area li:not(:has(li)).${EDIT_SELECTED_CLASS}::before {
  border-color: #1d4ed8;
  background: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.18);
}
.${EDIT_SELECTED_CLASS} {
  outline: 2px solid rgba(37, 99, 235, 0.26) !important;
  outline-offset: 1px !important;
  background-color: rgba(232, 240, 255, 0.82) !important;
  box-shadow: inset 3px 0 0 #2563eb !important;
}
`;
    doc.head.appendChild(style);
}
