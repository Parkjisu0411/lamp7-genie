import type { TargetKind, TargetProbe } from '../../shared/targets/types';

/** Serialized into MAIN world. Keep this function self-contained and read-only. */
export function probeTarget(kind: TargetKind): TargetProbe {
    const missing: string[] = [];
    const readBinding = (name: string): Record<string, unknown> | undefined => {
        try {
            return Function(`return typeof ${name} === 'undefined' ? undefined : ${name}`)();
        } catch {
            return undefined;
        }
    };
    const hasMethod = (value: Record<string, unknown> | undefined, method: string) =>
        typeof value?.[method] === 'function';
    const visibleElement = (el: Element) => {
        if (el.getClientRects().length === 0) return false;
        for (let node: Element | null = el; node; node = node.parentElement) {
            const style = node.ownerDocument.defaultView?.getComputedStyle(node);
            if (node.hasAttribute('hidden') || style?.display === 'none' ||
                style?.visibility === 'hidden' || style?.visibility === 'collapse' ||
                style?.opacity === '0') return false;
        }
        return true;
    };
    let visible = !!document.body && visibleElement(document.body);
    let focused = true;
    try {
        let current: Window = window;
        while (current !== current.top) {
            const frame = current.frameElement;
            // Unknown/cross-origin ancestry cannot establish an active target.
            if (!frame) { visible = false; focused = false; break; }
            visible = visible && visibleElement(frame);
            focused = focused && current.parent.document.activeElement === frame;
            current = current.parent;
        }
    } catch {
        visible = false;
        focused = false;
    }

    if (kind === 'logic') {
        if (!hasMethod(readBinding('LogicEditor'), 'getAll')) missing.push('LogicEditor.getAll');
        if (!document.querySelector('.logic_area')) missing.push('.logic_area');
    } else {
        const editor = readBinding('editor');
        for (const name of ['getWrapper', 'getSelectedAll', 'select', 'on', 'off']) {
            if (!hasMethod(editor, name)) missing.push(`editor.${name}`);
        }
        const canvas = editor?.Canvas as Record<string, unknown> | undefined;
        if (!hasMethod(canvas, 'getFrameEl')) missing.push('editor.Canvas.getFrameEl');
        const frame = document.querySelector<HTMLIFrameElement>('#gjs .gjs-frame');
        if (!frame?.contentDocument?.body) missing.push('canvas document');
        if (!document.querySelector('#screen-save')) missing.push('#screen-save');
    }
    const screenId = document.querySelector<HTMLInputElement>('#seq')?.value ||
        new URL(location.href).searchParams.get('seq');
    return { visible, focused, ready: missing.length === 0, url: location.href, screenId, missing };
}
