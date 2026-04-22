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
  border: none;
  background: linear-gradient(145deg, #bae6fd 0%, #7dd3fc 100%);
  box-shadow: 0 1px 3px rgba(56, 189, 248, 0.35);
}
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area li:not(:has(li)).${EDIT_SELECTED_CLASS}::before {
  background: linear-gradient(145deg, #38bdf8 0%, #0ea5e9 100%);
  box-shadow: 0 1px 4px rgba(14, 165, 233, 0.45);
}
.${EDIT_SELECTED_CLASS} {
  outline: none !important;
  background-color: rgba(186, 230, 253, 0.58) !important;
  box-shadow: none !important;
}
`;
    doc.head.appendChild(style);
}
