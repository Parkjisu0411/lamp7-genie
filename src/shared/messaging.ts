import type {
    ExtensionResponse,
    ExtensionMessage,
    ExtensionResponseFor,
} from './types/messages';
import { isExtensionContextValid } from './extensionContext';

export async function sendRuntimeMessage<M extends ExtensionMessage>(
    message: M,
): Promise<ExtensionResponseFor<M['action']>> {
    if (!isExtensionContextValid()) {
        throw new Error('Extension context invalidated');
    }
    return chrome.runtime.sendMessage(message) as Promise<ExtensionResponseFor<M['action']>>;
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
        chrome.runtime.sendMessage(message, (res: ExtensionResponse | undefined) => {
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
