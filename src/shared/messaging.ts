import type {
    ExtensionResponse,
    ExtensionMessage,
    ExtensionResponseFor,
} from './types/messages';
import { isExtensionContextValid } from './extensionContext';

let targetSessionId: string | undefined;
export function setMessageTarget(sessionId: string | undefined): void {
    targetSessionId = sessionId;
}
export function getMessageTarget(): string | undefined { return targetSessionId; }

function scoped<M extends ExtensionMessage>(message: M): M {
    return Object.hasOwn(message, 'targetSessionId') ? message : { ...message, targetSessionId };
}

/** Capture the panel's session, including effect cleanup and late async callbacks. */
export function bindTargetMessages() {
    const sessionId = targetSessionId;
    return {
        sessionId,
        send: <M extends ExtensionMessage>(message: M) =>
            sendRuntimeMessage({ ...message, targetSessionId: sessionId }),
        sendQuietly: (message: ExtensionMessage) =>
            sendRuntimeMessageQuietly({ ...message, targetSessionId: sessionId }),
    };
}

export async function sendRuntimeMessage<M extends ExtensionMessage>(
    message: M,
): Promise<ExtensionResponseFor<M['action']>> {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }
    return chrome.runtime.sendMessage(scoped(message)) as Promise<ExtensionResponseFor<M['action']>>;
}

export function sendRuntimeMessageSafely<M extends ExtensionMessage>(
    message: M,
    onResponse?: (res: ExtensionResponseFor<M['action']> | undefined) => void,
): void {
    if (!isExtensionContextValid()) {
        onResponse?.(undefined);
        return;
    }

    try {
        chrome.runtime.sendMessage(scoped(message), (res: ExtensionResponse | undefined) => {
            void chrome.runtime.lastError;
            onResponse?.(res as ExtensionResponseFor<M['action']> | undefined);
        });
    } catch {
        onResponse?.(undefined);
    }
}

export function sendRuntimeMessageQuietly(message: ExtensionMessage): void {
    sendRuntimeMessageSafely(message);
}
