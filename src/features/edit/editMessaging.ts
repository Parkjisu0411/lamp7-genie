import { sendRuntimeMessageSafely } from '../../shared/messaging';
import type {
    ExtensionMessage,
    ExtensionResponse,
    ExtensionResponseFor,
} from '../../shared/types/messages';

export function sendEditMessage(
    message: ExtensionMessage,
    onResponse?: (res: ExtensionResponse | undefined) => void,
): void {
    sendRuntimeMessageSafely(message, onResponse);
}

export function sendTypedEditMessage<M extends ExtensionMessage>(
    message: M,
    onResponse?: (res: ExtensionResponseFor<M['action']> | undefined) => void,
): void {
    sendEditMessage(message, onResponse as (res: ExtensionResponse | undefined) => void);
}
