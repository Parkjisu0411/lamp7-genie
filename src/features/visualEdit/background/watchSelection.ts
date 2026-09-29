/** MAIN world: stop on external changes; synchronous native deletion owns its own mutations. */
export function watchVisualSelection(modeId: string): boolean {
    type Editor = {
        on(events: string, fn: () => void): void;
        off(events: string, fn: () => void): void;
    };
    type Bridge = {
        modeId: string;
        editor: Editor;
        operation?: {
            requestId: string;
            modelIds: string[];
            consumed: boolean;
            kind: string;
            position?: string;
        };
        mutating: boolean;
        dispose(): void;
    };
    const host = window as unknown as { __lamp7GenieVisualEdit?: Bridge };
    host.__lamp7GenieVisualEdit?.dispose();
    const editor = Function('return typeof editor === "undefined" ? undefined : editor')() as
        | Editor
        | undefined;
    if (!editor?.on || !editor.off) return false;
    const events =
        'component:add component:remove component:update component:styleUpdate undo redo load';
    const changed = () => {
        if (!bridge.mutating)
            document.dispatchEvent(
                new CustomEvent('genie:visual-edit-invalid', { detail: modeId }),
            );
    };
    const ready = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (
            detail?.modeId === modeId &&
            !bridge.operation &&
            typeof detail.requestId === 'string' &&
            Array.isArray(detail.modelIds)
        )
            bridge.operation = {
                requestId: detail.requestId,
                modelIds: [...detail.modelIds],
                consumed: false,
                kind: detail.kind ?? 'delete',
                position: detail.position,
            };
    };
    const finished = (event: Event) => {
        const detail = (event as CustomEvent).detail;
        if (detail?.modeId === modeId && detail.requestId === bridge.operation?.requestId)
            bridge.operation = undefined;
    };
    const stop = (event: Event) => {
        if ((event as CustomEvent).detail === modeId) dispose();
    };
    const dispose = () => {
        editor.off(events, changed);
        document.removeEventListener('genie:visual-edit-stop', stop);
        document.removeEventListener('genie:visual-edit-delete-ready', ready);
        document.removeEventListener('genie:visual-edit-delete-finished', finished);
        window.removeEventListener('pagehide', dispose);
        if (host.__lamp7GenieVisualEdit?.modeId === modeId) delete host.__lamp7GenieVisualEdit;
    };
    const bridge: Bridge = { modeId, editor, mutating: false, dispose };
    host.__lamp7GenieVisualEdit = bridge;
    editor.on(events, changed);
    document.addEventListener('genie:visual-edit-stop', stop);
    document.addEventListener('genie:visual-edit-delete-ready', ready);
    document.addEventListener('genie:visual-edit-delete-finished', finished);
    window.addEventListener('pagehide', dispose, { once: true });
    return true;
}
