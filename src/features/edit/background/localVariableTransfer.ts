type LocalVariable = Record<string, unknown> & { id: string };
type ReadBinding = (name: string) => unknown;

/** MAIN-safe: clipboard metadata is private to Genie and never passed to LogicEditor. */
export function localVariableTransfer(
    input: Record<string, unknown>[],
    read: ReadBinding,
    mode: 'copy' | 'paste',
) {
    const key = '__genieLocalVariables';
    const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
    const logics = clone(input);
    const pairs = [
        ['type', 'id', 'pId'],
        ['setParamType', 'setParamId', 'pSetParamId'],
        ['setIndexType', 'setIndexId', 'pSetIndexId'],
        ['condParamType', 'condParamId', 'pCondParamId'],
        ['targetType', 'targetId', 'pTargetId'],
        ['subTargetType', 'subTargetId', 'pSubTargetId'],
    ];
    const refs = (value: unknown, visit: (obj: Record<string, unknown>, field: string) => void) => {
        if (!value || typeof value !== 'object') return;
        if (Array.isArray(value)) {
            value.forEach((v) => refs(v, visit));
            return;
        }
        const obj = value as Record<string, unknown>;
        for (const [type, id, parent] of pairs) {
            if (obj[type] === 'local' || obj[type] === 'V') {
                const field = obj[parent] ? parent : id;
                if (typeof obj[field] === 'string' && obj[field]) visit(obj, field);
            }
        }
        for (const [name, child] of Object.entries(obj)) {
            if (
                ['dataStructureSet', 'arraySet'].includes(name) &&
                typeof child === 'string' &&
                child.trim()
            ) {
                let parsed: unknown;
                try {
                    parsed = JSON.parse(child);
                } catch {
                    throw Error('변수 상세 설정을 읽을 수 없습니다. 원본 설정을 확인해 주세요.');
                }
                const before = JSON.stringify(parsed);
                refs(parsed, visit);
                if (JSON.stringify(parsed) !== before) obj[name] = JSON.stringify(parsed);
            } else if (name !== key) refs(child, visit);
        }
    };
    const needed = new Set<string>();
    for (const logic of logics) {
        if (logic.type === 'variable')
            refs(logic.variable, (obj, field) => needed.add(String(obj[field])));
    }
    const definitions = new Map<string, LocalVariable>();
    if (mode === 'paste') {
        for (const logic of logics) {
            const data = logic[key];
            if (data !== undefined && !Array.isArray(data))
                throw Error('지역변수 복사 정보가 올바르지 않습니다.');
            for (const row of (data ?? []) as LocalVariable[]) {
                if (!row || typeof row.id !== 'string' || !row.id || row.sapFuncTranId)
                    throw Error('일반 지역변수만 붙여넣을 수 있습니다.');
                if (
                    definitions.has(row.id) &&
                    JSON.stringify(definitions.get(row.id)) !== JSON.stringify(row)
                )
                    throw Error(`지역변수 ${row.id}의 복사 정의가 중복됩니다.`);
                definitions.set(row.id, clone(row));
            }
            delete logic[key];
        }
    }
    const idle = { logics, apply() {}, rollback() {} };
    if (mode === 'copy' ? !needed.size : !definitions.size) return idle;
    const jq = read('$') as { divTab(selector: string): { length: number; val(): string } };
    const gridId = read('_variableListGridId_');
    const helper = read('JqGridHelper') as {
        endEdit(grid: unknown): unknown;
        getGridDataAll(grid: unknown): { data?: LocalVariable[] };
        addRowData(
            grid: unknown,
            rowId: string,
            row: unknown,
            position: string,
            source: string,
        ): unknown;
        delRowData(grid: unknown, rowId: string): unknown;
    };
    if (!jq?.divTab || typeof gridId !== 'string' || !helper?.getGridDataAll)
        throw Error('지역변수 목록을 읽을 수 없습니다.');
    const grid = jq.divTab('#' + gridId);
    if (!grid?.length) throw Error('지역변수 목록을 찾을 수 없습니다.');
    const rows = helper.getGridDataAll(grid)?.data;
    if (!Array.isArray(rows)) throw Error('지역변수 목록을 읽을 수 없습니다.');
    const ownerId = jq.divTab('#id').val();
    const structures = read('_varStructMap_') as
        | Record<string, Record<string, unknown>>
        | undefined;
    const fields = ['id', 'name', 'dataType', 'dataTypeId', 'dataStructure', 'initYn'];
    const definition = (row: LocalVariable): LocalVariable => {
        const out = Object.fromEntries(fields.map((f) => [f, row[f] ?? ''])) as LocalVariable;
        // Only the declared structure, not a structure inferred from preceding assignments.
        if (!out.dataStructure && structures?.[ownerId]?.[row.id])
            out.dataStructure = clone(structures[ownerId][row.id]);
        return out;
    };
    if (mode === 'copy') {
        for (const id of needed) {
            const row = rows.find((r) => r.id === id);
            if (!row) throw Error(`지역변수 ${id}의 정의를 찾을 수 없습니다.`);
            if (row.sapFuncTranId)
                throw Error(`지역변수 ${id}는 SAP 연동 변수여서 함께 복사할 수 없습니다.`);
            definitions.set(id, definition(row));
        }
        // One snapshot per bundle; the existing array clipboard remains backwards compatible.
        logics[0][key] = [...definitions.values()];
        return idle;
    }
    const uid = read('uid') as (prefix: string) => string;
    const allocate = read('getTransactionUid') as (
        prefix: string,
        grid: unknown,
        check: string,
    ) => string;
    const parameterIds = read('variableParameterId') as Map<string, string>;
    if (
        !helper.endEdit ||
        !helper.addRowData ||
        !helper.delRowData ||
        !uid ||
        !allocate ||
        !parameterIds?.set ||
        !parameterIds?.delete
    )
        throw Error('지역변수 추가 기능을 사용할 수 없습니다.');
    if ([...definitions.values()].some((r) => !!r.dataStructure) && (!structures || !ownerId))
        throw Error('지역변수 구조 정보를 등록할 수 없습니다.');
    const canonical = (value: unknown): string => {
        if (typeof value === 'string') {
            try {
                return canonical(JSON.parse(value));
            } catch {
                return JSON.stringify(value);
            }
        }
        if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
        if (value && typeof value === 'object')
            return JSON.stringify(
                Object.keys(value)
                    .sort()
                    .map((k) => [k, canonical((value as Record<string, unknown>)[k])]),
            );
        return JSON.stringify(value);
    };
    const same = (a: LocalVariable, b: LocalVariable) =>
        ['dataTypeId', 'dataStructure', 'initYn'].every(
            (f) => canonical(a[f] ?? '') === canonical(b[f] ?? ''),
        );
    const added: Array<{ rowId: string; id: string; prior: unknown; had: boolean }> = [];
    let createdBucket = false;
    const rollback = () => {
        for (const item of added.reverse()) {
            helper.delRowData(grid, item.rowId);
            parameterIds.delete(item.rowId);
            if (structures?.[ownerId]) {
                if (item.had) structures[ownerId][item.id] = item.prior;
                else delete structures[ownerId][item.id];
            }
        }
        added.length = 0;
        if (createdBucket && structures && !Object.keys(structures[ownerId]).length)
            delete structures[ownerId];
        createdBucket = false;
    };
    return {
        logics,
        rollback,
        apply() {
            if (helper.endEdit(grid) === false) throw Error('지역변수 편집을 완료해 주세요.');
            const current = helper.getGridDataAll(grid)?.data;
            if (!Array.isArray(current)) throw Error('지역변수 목록을 읽을 수 없습니다.');
            const existing = new Map(current.map((r) => [r.id, r]));
            const mapping = new Map<string, string>();
            let no = Math.max(0, ...current.map((r) => Number(r.no) || 0));
            try {
                for (const source of definitions.values()) {
                    const found = existing.get(source.id);
                    if (found && !found.sapFuncTranId && same(source, definition(found))) {
                        mapping.set(source.id, source.id);
                        continue;
                    }
                    const id = found ? allocate(source.id, grid, source.id) : source.id;
                    if (!id || existing.has(id))
                        throw Error(`지역변수 ${source.id}의 새 ID를 만들 수 없습니다.`);
                    const rowId = uid('JG');
                    if (!rowId) throw Error('지역변수 행 ID를 만들 수 없습니다.');
                    const row: LocalVariable = { ...clone(source), id, no: ++no };
                    const bucket = structures?.[ownerId];
                    added.push({
                        rowId,
                        id,
                        prior: bucket?.[id],
                        had: !!bucket && Object.hasOwn(bucket, id),
                    });
                    if (helper.addRowData(grid, rowId, row, '', '') === false)
                        throw Error(`지역변수 ${id} 추가에 실패했습니다.`);
                    parameterIds.set(rowId, id);
                    if (row.dataStructure && structures) {
                        if (!structures[ownerId]) {
                            structures[ownerId] = {};
                            createdBucket = true;
                        }
                        structures[ownerId][id] = clone(row.dataStructure);
                    }
                    existing.set(id, row);
                    mapping.set(source.id, id);
                }
                // Update typed references only; literal text and object member keys stay intact.
                for (const logic of logics)
                    refs(logic, (obj, field) => {
                        const replacement = mapping.get(String(obj[field]));
                        if (replacement) {
                            const old = obj[field];
                            obj[field] = replacement;
                            if ((field === 'id' || field === 'pId') && obj.dataStructure === old)
                                obj.dataStructure = replacement;
                        }
                    });
            } catch (error) {
                rollback();
                throw error;
            }
        },
    };
}
