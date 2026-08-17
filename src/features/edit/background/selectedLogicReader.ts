import type {
    Lamp7Logic,
    MainWorldHelperSubset,
} from '../../../shared/mainWorld/logicTypes';
import type { LogicKind } from '../../../shared/types/messages';

export interface ResolveSelectedLogicsPayload {
    logicIds: string[];
}

type SelectedLogicReaderHelpers = MainWorldHelperSubset<
    | 'unwrapElement'
    | 'asStringId'
    | 'parseLogicKind'
    | 'kindFromJson'
    | 'toPlainObject'
    | 'callMaybe'
>;

export type SelectedLogicItemForMainWorld = {
    id: string;
    logicId: string;
    kind: LogicKind;
    label: string;
    snippet: string;
    seq: string;
    json: unknown;
};

export function resolveSelectedLogicItems(
    logics: Lamp7Logic[],
    payload: ResolveSelectedLogicsPayload,
    helpers: SelectedLogicReaderHelpers,
): SelectedLogicItemForMainWorld[] {
    const logicIdsFor = (logic: Lamp7Logic): string[] => {
        const ids: string[] = [];
        const push = (value: unknown) => {
            const id = helpers.asStringId(value);
            if (id) ids.push(id);
        };
        push(logic.id);
        push(logic.logicId);
        push(logic._id);
        try {
            if (typeof logic.getId === 'function') push(logic.getId());
        } catch {
            /* noop */
        }
        try {
            if (typeof logic.getElement === 'function') {
                const el = helpers.unwrapElement(logic.getElement());
                push(el?.id);
            }
        } catch {
            /* noop */
        }
        return ids;
    };

    const byId = new Map<string, Lamp7Logic>();
    for (const logic of logics) {
        for (const id of logicIdsFor(logic)) {
            if (!byId.has(id)) byId.set(id, logic);
        }
    }

    const extractJson = (logic: Lamp7Logic): Record<string, unknown> | null => {
        const methodCandidates = [
            logic.toJson,
            logic.toJSON,
            logic.getJson,
            logic.serialize,
        ];
        for (const method of methodCandidates) {
            const plain = helpers.toPlainObject(helpers.callMaybe(method, logic));
            if (plain && (plain.type || plain.id)) return plain;
            if (plain) return plain;
        }

        for (const key of ['json', 'data', '_data', 'raw'] as const) {
            const plain = helpers.toPlainObject((logic as Record<string, unknown>)[key]);
            if (plain) return plain;
        }

        let id = '';
        try {
            id = helpers.asStringId(
                typeof logic.getId === 'function' ? logic.getId() : logic.id,
            );
        } catch {
            id = helpers.asStringId(logic.id);
        }

        const type = helpers.asStringId(
            typeof logic.getType === 'function'
                ? helpers.callMaybe(logic.getType, logic)
                : logic.type,
        );

        let varPrefix = '';
        try {
            varPrefix = helpers.asStringId(
                typeof logic.getVarPrefix === 'function'
                    ? logic.getVarPrefix()
                    : logic.varPrefix,
            );
        } catch {
            varPrefix = helpers.asStringId(logic.varPrefix);
        }

        const assembled: Record<string, unknown> = {
            id,
            type,
            varPrefix,
            parentId: helpers.asStringId(logic.parentId),
            seq: helpers.asStringId(logic.seq),
        };
        for (const key of [
            'event',
            'transaction',
            'condition',
            'variable',
            'iteration',
            'loop',
            'control',
            'systemFunction',
        ] as const) {
            const plain = helpers.toPlainObject((logic as Record<string, unknown>)[key]);
            if (plain) assembled[key] = plain;
        }

        const plainAssembled = helpers.toPlainObject(assembled);
        if (plainAssembled && (plainAssembled.type || plainAssembled.id)) {
            return plainAssembled;
        }
        return null;
    };

    const items: SelectedLogicItemForMainWorld[] = [];
    for (const logicId of payload.logicIds) {
        const logic = byId.get(logicId);
        if (!logic) {
            console.error('[lamp7-genie] selected logic not found', { logicId });
            continue;
        }

        let label = '';
        try {
            const display =
                typeof logic.getDisplayText === 'function'
                    ? logic.getDisplayText()
                    : '';
            if (typeof display === 'string') label = display;
        } catch {
            /* keep default */
        }

        let json = extractJson(logic);
        if (!json) {
            console.error('[lamp7-genie] selected logic json extract failed', {
                logicId,
            });
        }

        let kind: LogicKind = 'event';
        try {
            const fromGetType =
                typeof logic.getType === 'function'
                    ? helpers.parseLogicKind(logic.getType())
                    : null;
            kind = helpers.kindFromJson(json) ?? fromGetType ?? 'event';
        } catch {
            kind = helpers.kindFromJson(json) ?? 'event';
        }

        if (json && !helpers.parseLogicKind(json.type)) {
            json = { ...json, type: kind };
        }

        const seq = helpers.asStringId(logic.seq);
        items.push({
            id: logicId,
            logicId,
            kind,
            label: label || logicId,
            snippet: label || logicId,
            seq,
            json,
        });
    }
    return items;
}
