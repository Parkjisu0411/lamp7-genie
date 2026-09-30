/** Scroll only the explicitly permitted area, never a containing frame.
 * A Document permits its canvas viewport; an element (including body) does not.
 * Hidden layout wrappers are not navigation scrollers, even if they overflow.
 */
export function scrollWithin(
    target: HTMLElement,
    boundary: HTMLElement | Document,
    block: 'center' | 'nearest' = 'center',
): void {
    const doc = target.ownerDocument;
    const win = doc.defaultView;
    const includeViewport = boundary === doc;
    const root = includeViewport ? doc.documentElement : (boundary as HTMLElement);
    if (!win || !target.isConnected || root.ownerDocument !== doc || !root.contains(target)) return;

    const nearest = (start: number, end: number, low: number, high: number) => {
        if (start < low && end > high) return 0;
        if (start < low) return end - start <= high - low ? start - low : end - high;
        if (end > high) return end - start <= high - low ? end - high : start - low;
        return 0;
    };
    if (target === root) return;
    for (let node = target.parentElement; node; node = node.parentElement) {
        const viewport = includeViewport && node === doc.scrollingElement;
        const documentRoot = node === doc.body || node === doc.documentElement;
        if (viewport || includeViewport || !documentRoot) {
            const css = win.getComputedStyle(node);
            const horizontal =
                (viewport || /^(auto|scroll|overlay)$/.test(css.overflowX)) &&
                node.scrollWidth > node.clientWidth;
            const vertical =
                (viewport || /^(auto|scroll|overlay)$/.test(css.overflowY)) &&
                node.scrollHeight > node.clientHeight;
            if (horizontal || vertical) {
                const area = node.getBoundingClientRect();
                const sx = viewport ? 1 : area.width / (node.offsetWidth || area.width || 1);
                const sy = viewport ? 1 : area.height / (node.offsetHeight || area.height || 1);
                const left = viewport ? 0 : area.left + node.clientLeft * sx;
                const top = viewport ? 0 : area.top + node.clientTop * sy;
                const width = viewport ? doc.documentElement.clientWidth : node.clientWidth * sx;
                const height = viewport ? doc.documentElement.clientHeight : node.clientHeight * sy;
                if (sx > 0 && sy > 0 && width > 0 && height > 0) {
                    // Re-read after each inner scroll so nested containers use the new position.
                    const rect = target.getBoundingClientRect();
                    const dx = horizontal
                        ? nearest(rect.left, rect.right, left, left + width) / sx
                        : 0;
                    const dy = vertical
                        ? (block === 'center'
                              ? rect.top + rect.height / 2 - top - height / 2
                              : nearest(rect.top, rect.bottom, top, top + height)) / sy
                        : 0;
                    if (dx || dy) node.scrollBy({ left: dx, top: dy, behavior: 'instant' });
                }
            }
        }
        if (node === root) break;
    }
}
