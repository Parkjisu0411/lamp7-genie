/** Styles shared by the isolated input shields. Never inserted in saved editor content. */
export const selectionOverlayStyles = `
    :host{font:13px/1.5 sans-serif;color:#3b0764}
    .surface{position:fixed;inset:0;cursor:crosshair;touch-action:none}
    .shade{position:fixed;background:rgba(241,245,249,.64);backdrop-filter:blur(2px);pointer-events:none}
    .box{position:fixed;box-sizing:border-box;border:2px solid #7c3aed;background:rgba(124,58,237,.08);pointer-events:none}
    .hover{border:1px dashed #7c3aed;background:transparent}
    .range{border:1px dashed #6d28d9;background:rgba(124,58,237,.07)}
    .tag{position:absolute;top:0;left:0;max-width:100%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;background:#6d28d9;color:white;padding:1px 5px;font:12px/18px sans-serif}
`;
