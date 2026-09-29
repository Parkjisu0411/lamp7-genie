import { isExtensionContextValid } from '../shared/extensionContext';
import { sendRuntimeMessageQuietly } from '../shared/messaging';
import { targetKindFromUrl } from '../shared/targets/routes';

/** Watch frame ancestors for modal visibility changes; do not observe all attributes. */
export function observeTargetContext(): void {
    if (!targetKindFromUrl(location.href) &&
        !(window === window.top && /\/container\/?$/.test(location.pathname))) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let stopped = false;
    const observers: MutationObserver[] = [];
    const listeners: Array<() => void> = [];
    const watched = new Set<Element>();
    const notify = () => {
        if (stopped || !isExtensionContextValid()) return;
        clearTimeout(timer);
        timer = setTimeout(() => sendRuntimeMessageQuietly({ action: 'TARGET_CONTEXT_DIRTY' }), 100);
    };
    const watch = (element: Element) => {
        if (watched.has(element)) return;
        watched.add(element);
        const observer = new MutationObserver(notify);
        observer.observe(element, { attributes: true, attributeFilter: ['class', 'style', 'hidden', 'src'] });
        observers.push(observer);
    };
    const relevantDocument = () => targetKindFromUrl(location.href) !== null ||
        Array.from(document.querySelectorAll('iframe')).some(frame => {
            try { return targetKindFromUrl(frame.contentWindow!.location.href) !== null; }
            catch { return false; }
        });
    const discover = () => {
        if (stopped) return;
        if (relevantDocument()) {
            for (const frame of document.querySelectorAll('iframe')) {
                for (let el: Element | null = frame; el; el = el.parentElement) watch(el);
            }
        }
        if (watched.size || relevantDocument()) notify();
    };
    const listen = (target: EventTarget, event: string, fn: EventListener) => {
        target.addEventListener(event, fn, true);
        listeners.push(() => target.removeEventListener(event, fn, true));
    };
    listen(document, 'load', discover);
    listen(window, 'pageshow', discover);
    listen(window, 'focus', () => { if (relevantDocument()) notify(); });
    const structureObserver = new MutationObserver(records => {
        if (records.some(record => [...record.addedNodes, ...record.removedNodes].some(node =>
            node instanceof Element && (node.matches('iframe') || !!node.querySelector('iframe'))))) discover();
    });
    structureObserver.observe(document.documentElement, { childList: true, subtree: true });
    observers.push(structureObserver);
    discover();
    // Bounded retries cover async editor initialization after document_idle.
    let retries = 0;
    const retry = () => {
        if (stopped || !isExtensionContextValid() || ++retries > 5) return;
        if (targetKindFromUrl(location.href)) notify();
        retryTimer = setTimeout(retry, 1000);
    };
    retry();
    window.addEventListener('pagehide', () => {
        stopped = true;
        clearTimeout(timer);
        clearTimeout(retryTimer);
        observers.forEach(observer => observer.disconnect());
        listeners.forEach(dispose => dispose());
        sendRuntimeMessageQuietly({ action: 'TARGET_CONTEXT_DIRTY' });
        window.addEventListener('pageshow', event => {
            if (event.persisted) observeTargetContext();
        }, { once: true });
    }, { once: true });
}
