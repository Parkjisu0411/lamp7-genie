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
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area ul > li {
  position: relative;
  padding-left: 22px;
  cursor: pointer;
  box-sizing: border-box;
}
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area ul > li::before {
  content: '';
  position: absolute;
  left: 5px;
  top: 50%;
  transform: translateY(-50%);
  width: 8px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.35);
  background: repeating-linear-gradient(
    to bottom,
    transparent 0 2px,
    rgba(0, 0, 0, 0.2) 2px 3px
  );
}
.${EDIT_WRAP_ACTIVE_CLASS} .logic_seq_area ul > li.${EDIT_SELECTED_CLASS}::before {
  border-color: #e65100;
  background: rgba(255, 152, 0, 0.35);
}
.${EDIT_SELECTED_CLASS} {
  outline: 1px solid rgba(255, 152, 0, 0.85) !important;
  outline-offset: -1px;
  background-color: rgba(255, 224, 178, 0.35) !important;
}
`;
    doc.head.appendChild(style);
}
