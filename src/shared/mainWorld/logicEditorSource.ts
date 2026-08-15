export const LOGIC_EDITOR_HELPER_SOURCE = String.raw`
const __lamp7GenieMainWorld = (() => {
    const readGlobalBinding = (name) => {
        try {
            return Function('"use strict"; return typeof ' + name + ' === "undefined" ? undefined : ' + name + ';')();
        } catch {
            return undefined;
        }
    };

    const readBinding = (name) => {
        try {
            const value = window[name];
            return value !== undefined ? value : readGlobalBinding(name);
        } catch {
            return readGlobalBinding(name);
        }
    };

    const unwrapElement = (raw) => {
        if (!raw) return null;
        if (typeof raw.setAttribute === 'function') return raw;
        if (typeof raw.get === 'function') {
            const got = raw.get(0);
            if (got && typeof got.setAttribute === 'function') return got;
        }
        if (typeof raw.length === 'number' && raw[0] && typeof raw[0].setAttribute === 'function') {
            return raw[0];
        }
        for (const key of ['el', 'element', 'node', 'dom', '$el']) {
            const candidate = raw[key];
            if (candidate && typeof candidate.setAttribute === 'function') return candidate;
        }
        return null;
    };

    const asStringId = (value) => {
        if (typeof value === 'string' && value.trim()) return value.trim();
        if (typeof value === 'number' && Number.isFinite(value)) return String(value);
        return '';
    };

    const parseLogicKind = (value) => {
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
    };

    const isPlainPayloadObject = (value) =>
        !!value && typeof value === 'object' && !Array.isArray(value);

    const kindFromJson = (json) => {
        if (!isPlainPayloadObject(json)) return null;
        const fromType = parseLogicKind(json.type);
        if (fromType) return fromType;
        if (isPlainPayloadObject(json.transaction)) return 'transaction';
        if (isPlainPayloadObject(json.event)) return 'event';
        if (isPlainPayloadObject(json.condition)) return 'condition';
        if (isPlainPayloadObject(json.variable)) return 'variable';
        if (isPlainPayloadObject(json.iteration) || isPlainPayloadObject(json.loop)) return 'iteration';
        if (isPlainPayloadObject(json.control) || isPlainPayloadObject(json.systemFunction)) return 'control';
        return null;
    };

    const toPlainObject = (value) => {
        if (value == null) return null;
        if (typeof value === 'string') {
            try {
                const parsed = JSON.parse(value);
                return isPlainPayloadObject(parsed) ? parsed : null;
            } catch {
                return null;
            }
        }
        if (!isPlainPayloadObject(value)) return null;
        try {
            return JSON.parse(JSON.stringify(value));
        } catch {
            // circular / DOM fields are copied field-by-field below
        }

        const out = {};
        for (const key of Object.keys(value)) {
            const v = value[key];
            const t = typeof v;
            if (v == null || t === 'string' || t === 'number' || t === 'boolean') {
                out[key] = v;
                continue;
            }
            if (t === 'object') {
                try {
                    out[key] = JSON.parse(JSON.stringify(v));
                } catch {
                    // skip non-serializable field
                }
            }
        }
        return Object.keys(out).length > 0 ? out : null;
    };

    const callMaybe = (fn, thisArg) => {
        if (typeof fn !== 'function') return undefined;
        try {
            return fn.call(thisArg);
        } catch {
            return undefined;
        }
    };

    return {
        readBinding,
        unwrapElement,
        asStringId,
        parseLogicKind,
        kindFromJson,
        toPlainObject,
        callMaybe,
    };
})();
`;

