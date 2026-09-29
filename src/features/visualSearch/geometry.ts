export interface Rect {
    left: number;
    top: number;
    width: number;
    height: number;
}

export function intersectRect(a: Rect, b: Rect): Rect | null {
    const left = Math.max(a.left, b.left),
        top = Math.max(a.top, b.top);
    const right = Math.min(a.left + a.width, b.left + b.width);
    const bottom = Math.min(a.top + a.height, b.top + b.height);
    return right > left && bottom > top
        ? { left, top, width: right - left, height: bottom - top }
        : null;
}

export function projectCanvasRect(
    rect: Rect,
    frame: Rect,
    viewport: { width: number; height: number },
): Rect {
    const sx = frame.width / viewport.width,
        sy = frame.height / viewport.height;
    return {
        left: frame.left + rect.left * sx,
        top: frame.top + rect.top * sy,
        width: rect.width * sx,
        height: rect.height * sy,
    };
}
