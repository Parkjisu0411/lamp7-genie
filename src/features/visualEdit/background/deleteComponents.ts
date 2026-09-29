import type { readVisualComponents } from '../../visualSearch/background/readComponents';
import type { buildSelectionPolicy } from '../policy';
import type { VisualDeleteResult, VisualDeleteSelection } from '../types';

/** MAIN world. Uses the installed Lamp7 command hooks exactly once per selected root. */
export function deleteVisualComponents(
    payload: VisualDeleteSelection,
    sources: { reader: string; policy: string },
): VisualDeleteResult {
    type Model = {
        cid: string;
        get(key: string): unknown;
        getEl?(): HTMLElement | undefined;
        parent(): Model | undefined;
        index(): number;
    };
    type Editor = {
        getWrapper(): Model;
        getSelected(): Model | undefined;
        getSelectedAll(): Model[];
        select(model: Model | null): void;
        runCommand(name: string, options?: { component: Model }): unknown;
        on(name: string, fn: () => void): void;
        off(name: string, fn: () => void): void;
        getModel?(): { isEditing?(): boolean };
    };
    type Bridge = {
        modeId: string;
        editor: Editor;
        mutating: boolean;
        operation?: { requestId: string; modelIds: string[]; consumed: boolean; kind?: string };
    };
    const read = (name: string) =>
        Function(`return typeof ${name} === 'undefined' ? undefined : ${name}`)();
    const host = window as unknown as { __lamp7GenieVisualEdit?: Bridge };
    const ids = payload.locations.map((location) => location.modelId);
    const result: VisualDeleteResult = { deletedIds: [], cascadedIds: [], remainingIds: [...ids] };
    const bridge = host.__lamp7GenieVisualEdit;
    let reader: typeof readVisualComponents | undefined;
    let editor: Editor | undefined;
    let currentId: string | undefined;
    let ownsMutation = false;
    let commandStarted = false;
    const initiallyPresent = new Set<string>();
    try {
        if (
            !bridge ||
            bridge.modeId !== payload.modeId ||
            bridge.operation?.requestId !== payload.requestId ||
            (bridge.operation.kind !== undefined && bridge.operation.kind !== 'delete') ||
            bridge.operation.consumed ||
            bridge.mutating ||
            !ids.length ||
            new Set(ids).size !== ids.length ||
            bridge.operation.modelIds.length !== ids.length ||
            ids.some((id) => !bridge.operation!.modelIds.includes(id))
        )
            throw new Error('선택모드가 종료되었거나 이미 처리한 삭제 요청입니다.');
        bridge.operation.consumed = true;
        editor = read('editor') as Editor;
        if (
            editor !== bridge.editor ||
            !editor?.select ||
            !editor.runCommand ||
            !editor.getSelectedAll ||
            !editor.getSelected ||
            !editor.getWrapper ||
            !editor.on ||
            !editor.off ||
            ['deleteBeforeEvent', 'deleteEndEvent', 'selectedComponent'].some(
                (name) => typeof read(name) !== 'function',
            )
        )
            throw new Error('현재 Lamp7의 기본 삭제 기능에 연결할 수 없습니다.');
        const frame = document.querySelector<HTMLIFrameElement>('#gjs .gjs-frame');
        const canvas = frame?.contentDocument;
        if (
            !canvas ||
            editor.getModel?.().isEditing?.() ||
            canvas.querySelector('[contenteditable="true"]')
        )
            throw new Error('텍스트 편집을 마친 뒤 삭제해 주세요.');
        if (read('ctrlKey') || read('shiftKey'))
            throw new Error('Ctrl·Shift 키를 놓은 뒤 삭제해 주세요.');
        reader = Function(`return (${sources.reader})`)() as typeof readVisualComponents;
        const policy = Function(`return (${sources.policy})`)() as typeof buildSelectionPolicy;
        const snapshot = reader();
        if (snapshot.error) throw new Error(snapshot.error);
        result.records = snapshot.records;
        const selection = policy(snapshot.records);
        const models = () => {
            const found = new Map<string, Model>(),
                seen = new Set<Model>();
            const visit = (model: Model) => {
                if (seen.has(model)) return;
                seen.add(model);
                found.set(model.cid, model);
                const collection = model.get('components') as { models?: Model[] } | undefined;
                for (const child of collection?.models ?? []) visit(child);
            };
            visit(editor!.getWrapper());
            return found;
        };
        const initial = models();
        for (const id of initial.keys()) initiallyPresent.add(id);
        for (const location of payload.locations) {
            const record = selection.byId.get(location.modelId);
            const model = initial.get(location.modelId);
            if (
                !record ||
                !model ||
                !model.get('removable') ||
                selection.canonical(location.modelId) !== location.modelId ||
                record.location.domId !== location.domId ||
                record.location.eid !== location.eid ||
                record.location.vid !== location.vid ||
                selection.ancestorMap.get(location.modelId)?.some((parent) => ids.includes(parent))
            )
                throw new Error(
                    '선택 항목이 변경되었거나 삭제할 수 없는 항목입니다. 다시 선택해 주세요.',
                );
        }
        const valid = () =>
            host.__lamp7GenieVisualEdit === bridge &&
            bridge.operation?.requestId === payload.requestId &&
            frame?.isConnected &&
            frame.contentDocument === canvas;
        document.dispatchEvent(
            new CustomEvent('genie:visual-edit-delete-mutating', {
                detail: { modeId: payload.modeId, requestId: payload.requestId },
            }),
        );
        if (!valid()) throw new Error('삭제 전에 화면이 변경되었습니다.');
        bridge.mutating = true;
        ownsMutation = true;
        // Preserve the selected root order. Re-resolve identity after each native cascade.
        for (const id of ids) {
            currentId = id;
            if (!valid()) throw new Error('대상 화면이 변경되어 삭제를 중단했습니다.');
            const model = models().get(id);
            if (!model) {
                result.cascadedIds.push(id);
                continue;
            }
            if (model !== initial.get(id) || !model.get('removable'))
                throw new Error('항목이 변경되었거나 더 이상 삭제할 수 없습니다.');
            if (read('ctrlKey') || read('shiftKey'))
                throw new Error('선택 상태가 변경되어 삭제를 중단했습니다.');
            editor.select(model);
            if (
                editor.getSelected() !== model ||
                editor.getSelectedAll().length !== 1 ||
                editor.getSelectedAll()[0] !== model
            )
                throw new Error('Lamp7의 선택 대상이 달라 삭제를 중단했습니다.');
            // Selecting an already-selected model does not always fire component:selected.
            // This native helper only remembers the current parent/index for deleteEndEvent.
            (read('selectedComponent') as (model: Model) => void)(model);
            if (
                !valid() ||
                read('_selectParentCompo') !== model.parent() ||
                read('_selectCompoIndex') !== model.index()
            )
                throw new Error('Lamp7의 삭제 대상 정보를 확인할 수 없습니다.');
            let aborted = false;
            const abort = () => {
                aborted = true;
            };
            editor.on('abort:core:component-delete', abort);
            try {
                commandStarted = true;
                editor.runCommand('core:component-delete', { component: model });
            } catch (error) {
                if (!models().has(id)) result.deletedIds.push(id);
                throw error;
            } finally {
                editor.off('abort:core:component-delete', abort);
            }
            if (!models().has(id)) result.deletedIds.push(id);
            if (aborted || models().has(id))
                throw new Error('Lamp7에서 삭제를 취소했거나 항목이 삭제되지 않았습니다.');
        }
        currentId = undefined;
    } catch (error) {
        const message =
            error instanceof Error ? error.message : '기본 삭제 처리 중 오류가 발생했습니다.';
        result.error = message;
        if (currentId) result.failed = { id: currentId, message };
    } finally {
        if (bridge && ownsMutation) bridge.mutating = false;
        // A failure in before/after hooks can still have side effects. Always read actual state.
        if (reader) {
            const snapshot = reader();
            if (!snapshot.error) {
                result.records = snapshot.records;
                const remaining = new Set(
                    snapshot.records.map((record) => record.location.modelId),
                );
                result.remainingIds = ids.filter((id) => remaining.has(id));
                for (const id of ids)
                    if (
                        commandStarted &&
                        initiallyPresent.has(id) &&
                        !remaining.has(id) &&
                        !result.deletedIds.includes(id) &&
                        !result.cascadedIds.includes(id)
                    )
                        result.cascadedIds.push(id);
            } else {
                result.records = undefined;
                result.error ??= '삭제 후 화면을 다시 읽을 수 없습니다. 현재 화면을 확인해 주세요.';
            }
        }
    }
    return result;
}
