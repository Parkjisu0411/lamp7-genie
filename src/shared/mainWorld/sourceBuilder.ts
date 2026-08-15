export function mainWorldFunctionSource(fn: (...args: never[]) => unknown): string {
    return fn.toString();
}
