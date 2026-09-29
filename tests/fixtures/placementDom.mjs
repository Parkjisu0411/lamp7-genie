// Small DOM double for MAIN unit tests. CSS matching with a real browser is covered
// by tests/browser/visual-edit.html; this double intentionally supports only test selectors.
export function placementDocument() {
    const doc = { implementation: { createHTMLDocument: () => doc } };
    doc.createElement = tag => {
        const attrs = {}, children = [];
        const el = {
            tagName: tag.toUpperCase(), ownerDocument: doc, isConnected: true, children, parentElement: null,
            get id() { return attrs.id || ''; }, set id(v) { attrs.id = v; },
            get className() { return attrs.class || ''; }, set className(v) { attrs.class = v; },
            get classList() { const cs = el.className.split(/\s+/).filter(Boolean); return { contains: c => cs.includes(c), [Symbol.iterator]: function* () { yield* cs; } }; },
            setAttribute: (k,v) => { attrs[k.toLowerCase()] = String(v); }, getAttribute: k => attrs[k.toLowerCase()] ?? null,
            matches(selector) {
                return selector.split(/,(?![^()]*\))/).some(s => {
                    s = s.trim(); if (!s) return false;
                    let denied = false;
                    s = s.replace(/:not\(([^)]+)\)/g, (_, not) => { denied ||= el.matches(not); return ''; });
                    if (denied) return false;
                    if (s.includes(':empty') && (children.length || el.textContent)) return false;
                    s = s.replaceAll(':empty','');
                    const classes = [...s.matchAll(/\.([\w-]+)/g)].map(m=>m[1]);
                    if (classes.some(c=>!el.classList.contains(c))) return false;
                    s = s.replace(/\.[\w-]+/g,'');
                    if (s.startsWith('[class*=')) return el.className.includes(s.slice(8,-1).replace(/["']/g,''));
                    if (s.startsWith('#')) return el.id === s.slice(1);
                    if (s.startsWith('[')) { const m=s.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/); return !!m && (m[2] ? el.getAttribute(m[1])===m[2] : el.getAttribute(m[1])!==null); }
                    return !s || s === '*' || s.toUpperCase() === el.tagName;
                });
            },
            closest(selector) { return el.matches(selector) ? el : el.parentElement?.closest(selector) ?? null; },
            contains(other) { return el === other || children.some(c=>c.contains(other)); },
            get outerHTML() { return `<${tag} ${Object.entries(attrs).map(([k,v])=>`${k}="${v}"`).join(' ')}></${tag}>`; },
        };
        if (tag === 'template') Object.defineProperty(el,'innerHTML',{set(html) { const m = html.match(/^\s*<([\w-]+)([^>]*)>/); const child = doc.createElement(m[1]); for(const a of m[2].matchAll(/([\w-]+)="([^"]*)"/g))child.setAttribute(a[1],a[2]); el.content={ firstElementChild:child, children:[child] }; }});
        return el;
    };
    return doc;
}
