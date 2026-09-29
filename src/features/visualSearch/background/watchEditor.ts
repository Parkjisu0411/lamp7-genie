/** MAIN world lifecycle bridge. Sends invalidations only; never exposes privileged commands. */
export function watchVisualEditor(sessionId: string): boolean {
    type Editor = {
        on(events: string, fn: () => void): void;
        off(events: string, fn: () => void): void;
    };
    type Bridge = { sessionId: string; dispose(): void };
    const host = window as unknown as { __lamp7GenieVisualSearch?: Bridge };
    if (host.__lamp7GenieVisualSearch?.sessionId === sessionId) return true;
    host.__lamp7GenieVisualSearch?.dispose();
    const editor = Function('return typeof editor === "undefined" ? undefined : editor')() as
        | Editor
        | undefined;
    if (!editor?.on || !editor.off) return false;
    const events =
        'component:add component:remove component:update component:styleUpdate undo redo load';
    let timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
        clearTimeout(timer);
        timer = setTimeout(
            () =>
                document.dispatchEvent(
                    new CustomEvent('genie:visual-search-changed', { detail: sessionId }),
                ),
            180,
        );
    };
    const stop = (event: Event) => {
        if ((event as CustomEvent).detail === sessionId) dispose();
    };
    const dispose = () => {
        clearTimeout(timer);
        editor.off(events, changed);
        document.removeEventListener('genie:visual-search-stop', stop);
        window.removeEventListener('pagehide', dispose);
        if (host.__lamp7GenieVisualSearch?.sessionId === sessionId)
            delete host.__lamp7GenieVisualSearch;
    };
    host.__lamp7GenieVisualSearch = { sessionId, dispose };
    editor.on(events, changed);
    document.addEventListener('genie:visual-search-stop', stop);
    window.addEventListener('pagehide', dispose, { once: true });
    return true;
}
