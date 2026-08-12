import type { LogicKind } from './types/messages';

/** 호스트 Logic.getType() / toJson().type → UI kind */
export function parseLogicKind(value: unknown): LogicKind | null {
    if (typeof value !== 'string') return null;
    const raw = value.trim().toLowerCase();
    if (
        raw === 'event' ||
        raw === 'transaction' ||
        raw === 'condition' ||
        raw === 'variable' ||
        raw === 'iteration' ||
        raw === 'control'
    ) {
        return raw;
    }
    if (raw === 'loop') return 'iteration';
    if (raw === 'systemfunction' || raw === 'system_function') return 'control';
    return null;
}

function isPayloadObject(value: unknown): boolean {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * JSON.type 우선. 없으면 비어 있지 않은 타입별 payload로 추론
 * (복사본에서 type이 빠지거나 nested type만 남은 경우 대비)
 */
export function logicKindFromJson(json: unknown): LogicKind | null {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return null;
    const raw = json as Record<string, unknown>;

    const fromType = parseLogicKind(raw.type);
    if (fromType) return fromType;

    if (isPayloadObject(raw.transaction)) return 'transaction';
    if (isPayloadObject(raw.event)) return 'event';
    if (isPayloadObject(raw.condition)) return 'condition';
    if (isPayloadObject(raw.variable)) return 'variable';
    if (isPayloadObject(raw.iteration) || isPayloadObject(raw.loop)) return 'iteration';
    if (isPayloadObject(raw.control) || isPayloadObject(raw.systemFunction)) {
        return 'control';
    }

    return null;
}
