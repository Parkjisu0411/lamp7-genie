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
    type Grid = {
        0?: HTMLTableElement;
        length: number;
        val(): string;
        jqGrid(command: string, ...args: unknown[]): unknown;
    };
    const jq = read('$') as { divTab(selector: string): Grid };
    const gridId = read('_variableListGridId_');
    const helper = read('JqGridHelper') as {
        endEdit(grid: unknown): unknown;
        setRowData(
            grid: unknown,
            rowId: string,
            type: string,
            data: Record<string, unknown>,
            useEndEdit: boolean,
        ): unknown;
        getGridDataAll(grid: unknown): { data?: LocalVariable[] };
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
    const allocate = read('getTransactionUid') as (
        prefix: string,
        grid: unknown,
        check: string,
    ) => string;
    const addRow = read('gridAddBtn') as (gridId: string) => void;
    const deleteRows = read('gridDelBtn') as (gridId: string) => void;
    if (
        !helper.endEdit ||
        typeof helper.setRowData !== 'function' ||
        typeof addRow !== 'function' ||
        typeof deleteRows !== 'function' ||
        typeof allocate !== 'function' ||
        typeof grid.jqGrid !== 'function' ||
        !grid[0]
    )
        throw Error('지역변수 추가 기능을 사용할 수 없습니다.');
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
    // Validate the detached clipboard structure without opening its editor.
    const structureJson = (value: unknown): string => {
        const parsed = typeof value === 'string' ? JSON.parse(value) : clone(value);
        const valid = (node: unknown): boolean =>
            node !== false &&
            (!node || typeof node !== 'object' || Object.values(node).every(valid));
        if (
            !parsed ||
            typeof parsed !== 'object' ||
            !parsed.structure ||
            !parsed.info ||
            !valid(parsed.structure)
        )
            throw Error('지역변수 구조 정의가 올바르지 않습니다. 원본 구조를 확인해 주세요.');
        return JSON.stringify(parsed);
    };
    const getRows = () => {
        const result = helper.getGridDataAll(grid)?.data;
        if (!Array.isArray(result)) throw Error('지역변수 목록을 읽을 수 없습니다.');
        return result;
    };
    const checkScope = () => {
        if (jq.divTab('#' + gridId)[0] !== grid[0] || jq.divTab('#id').val() !== ownerId)
            throw Error('대상 화면이 변경되었습니다. 다시 시도해 주세요.');
    };
    const finishEdit = () => {
        if (
            helper.endEdit(grid) === false ||
            (grid.jqGrid('getGridParam', 'savedRow') as unknown[] | undefined)?.length
        )
            throw Error('지역변수 편집을 완료해 주세요.');
    };
    const findRow = (rowId: string) => {
        const row = Array.from(grid[0]!.rows).find((row) => row.id === rowId);
        if (!row) throw Error('추가한 지역변수 행을 찾을 수 없습니다.');
        return row;
    };
    type SaveCell = (
        this: unknown,
        rowId: string,
        field: string,
        value: string,
        row: number,
        column: number,
    ) => unknown;
    const beforeSave = grid.jqGrid('getGridParam', 'beforeSaveCell') as SaveCell;
    const afterSave = grid.jqGrid('getGridParam', 'afterSaveCell') as SaveCell;
    const common = read('CommonHelper') as {
        getStructureDataTypeName(type: string): string;
        checkReservedWord(value: string): unknown;
    };
    const register = (rowId: string, id: string, source: LocalVariable, structure: string) => {
        checkScope();
        const columns = grid.jqGrid('getGridParam', 'colModel') as { name: string }[];
        const column = columns.findIndex((item) => item.name === 'id');
        const row = findRow(rowId);
        const previous = getRows().find((item) => item._ID_ === rowId)!;
        // These native callbacks read the prior ID from savedRow and resolve the
        // row via this.rows. Supply a detached callback context; never edit the
        // live grid's savedRow or create an input/Select2 widget.
        const context = {
            rows: grid[0]!.rows,
            p: { savedRow: [{ id: row.rowIndex, ic: column, v: previous.id }] },
        };
        const accepted = beforeSave.call(context, rowId, 'id', id, row.rowIndex, column);
        if (accepted !== undefined && accepted !== id)
            throw Error(`지역변수 ${id} ID를 적용할 수 없습니다.`);
        checkScope();
        helper.setRowData(
            grid,
            rowId,
            '',
            {
                id,
                name: source.name ?? '',
                dataType: common.getStructureDataTypeName(String(source.dataTypeId)),
                dataTypeId: source.dataTypeId,
                dataStructure: structure,
                initYn: source.initYn ?? '',
            },
            false,
        );
        // ID completion validates duplicates and owns variableParameterId and
        // the declared structure map. Apply all fields first so it sees the
        // final type/structure; no popup completion or type-change UI is needed.
        for (const field of ['id', 'name', 'initYn']) {
            checkScope();
            afterSave.call(
                grid[0],
                rowId,
                field,
                String(field === 'id' ? id : (source[field] ?? '')),
                row.rowIndex,
                columns.findIndex((item) => item.name === field),
            );
            if (getRows().find((item) => item._ID_ === rowId)?.id !== id)
                throw Error(`지역변수 ${id} 설정을 완료하지 못했습니다.`);
        }
        // Same display rule as Lamp7's loadComplete, scoped to the new row.
        const cell = Array.from(row.cells).find(
            (cell) => cell.getAttribute('aria-describedby') === gridId + '_dataStructurePopup',
        );
        cell?.classList.add('grid_cell_disable');
        cell?.querySelectorAll<HTMLElement>('span').forEach((span) => {
            span.style.display = ['OBJ', 'LIST-OBJ'].includes(String(source.dataTypeId))
                ? 'block'
                : 'none';
        });
    };
    const added: string[] = [];
    const rollback = () => {
        if (!added.length) return;
        checkScope();
        // Cancel any rejected cell edit before using the same delete button route.
        const saved = grid.jqGrid('getGridParam', 'savedRow') as { id: number; ic: number }[];
        for (const cell of [...(saved ?? [])]) grid.jqGrid('restoreCell', cell.id, cell.ic);
        grid.jqGrid('resetSelection');
        for (const rowId of added) {
            if (getRows().some((row) => row._ID_ === rowId))
                grid.jqGrid('setSelection', rowId, false);
        }
        deleteRows(gridId);
        if (getRows().some((row) => added.includes(String(row._ID_))))
            throw Error(
                '추가된 지역변수를 자동으로 취소하지 못했습니다. 변수 목록을 확인해 주세요.',
            );
        added.length = 0;
    };
    return {
        logics,
        rollback,
        apply() {
            checkScope();
            finishEdit();
            const current = getRows();
            const existing = new Map(current.map((r) => [r.id, r]));
            const mapping = new Map<string, string>();
            const structurePayloads = new Map<string, string>();
            for (const source of definitions.values()) {
                const found = existing.get(source.id);
                if (found && !found.sapFuncTranId && same(source, definition(found))) continue;
                const columns = grid.jqGrid('getGridParam', 'colModel') as { name: string }[];
                if (
                    typeof beforeSave !== 'function' ||
                    typeof afterSave !== 'function' ||
                    !common?.getStructureDataTypeName ||
                    !common?.checkReservedWord ||
                    !Array.isArray(columns) ||
                    fields.some((field) => !columns.some((col) => col.name === field))
                )
                    throw Error('지역변수 등록 기능을 사용할 수 없습니다.');
                if (
                    !/^[a-zA-Z_│][a-zA-Z0-9_│]*$/.test(source.id) ||
                    (read('_appType_') === 'WEB' && common.checkReservedWord(source.id))
                )
                    throw Error(`지역변수 ${source.id} ID를 사용할 수 없습니다.`);
                if (
                    !common.getStructureDataTypeName(String(source.dataTypeId)) ||
                    !['', 'Y'].includes(String(source.initYn ?? ''))
                )
                    throw Error(`지역변수 ${source.id}의 유형 또는 선언 값이 올바르지 않습니다.`);
                if (
                    ['OBJ', 'LIST-OBJ'].includes(String(source.dataTypeId)) &&
                    !structures?.[ownerId]
                )
                    throw Error('지역변수 구조 등록 기능을 사용할 수 없습니다.');
                if (source.dataStructure) {
                    if (!['OBJ', 'LIST-OBJ'].includes(String(source.dataTypeId)))
                        throw Error(`지역변수 ${source.id}의 유형과 구조가 일치하지 않습니다.`);
                    structurePayloads.set(source.id, structureJson(source.dataStructure));
                }
            }
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
                    const before = new Set(getRows().map((row) => row._ID_));
                    grid.jqGrid('resetSelection');
                    try {
                        addRow(gridId);
                    } finally {
                        for (const row of getRows())
                            if (!before.has(row._ID_)) added.push(String(row._ID_));
                    }
                    const newRows = getRows().filter((row) => !before.has(row._ID_));
                    if (newRows.length !== 1 || !newRows[0]._ID_)
                        throw Error(`지역변수 ${id} 추가에 실패했습니다.`);
                    const rowId = String(newRows[0]._ID_);
                    register(rowId, id, source, structurePayloads.get(source.id) ?? '');
                    const row = getRows().find((row) => row._ID_ === rowId);
                    if (
                        !row ||
                        row.id !== id ||
                        row.name !== (source.name ?? '') ||
                        !same(source, definition(row))
                    )
                        throw Error(`지역변수 ${id} 설정을 완료하지 못했습니다.`);
                    existing.set(id, clone(row));
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
                try {
                    rollback();
                } catch (cleanup) {
                    throw Error(
                        `${error instanceof Error ? error.message : String(error)} ${cleanup instanceof Error ? cleanup.message : String(cleanup)}`,
                    );
                }
                throw error;
            }
        },
    };
}
