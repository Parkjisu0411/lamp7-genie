import type {
    CreatedLamp7Logic,
    DivTabHostMainWorld,
    Lamp7Logic,
    LogicEditorMainWorld,
    LogicEventHandlerMainWorld,
    LogicRendererMainWorld,
    MainWorldHelperSubset,
} from '../../../shared/mainWorld/logicTypes';
import type {
    EditPasteLogicsPayload,
    EditPasteLogicsResponseData,
} from '../../../shared/types/messages';
import type { LogicPasteContext } from '../pasteTypes';
import type { localVariableTransfer } from './localVariableTransfer';
import type { readLogicPasteContext } from './pasteContext';

export interface PasteCopiedLogicsPayload extends EditPasteLogicsPayload {
    context: LogicPasteContext;
}
type PasteHelpers = MainWorldHelperSubset<'readBinding' | 'asStringId' | 'unwrapElement'>;

/** Synchronous MAIN operation. The click ticket is consumed before the first native mutation. */
export function pasteCopiedLogicsInMainWorld(
    payload: PasteCopiedLogicsPayload,
    helpers: PasteHelpers,
    readContext: typeof readLogicPasteContext,
    transferVariables?: typeof localVariableTransfer,
): EditPasteLogicsResponseData {
    const created: CreatedLamp7Logic[] = [];
    const errors: EditPasteLogicsResponseData['errors'] = [];
    let validationWarnings = 0;
    let variables: ReturnType<typeof localVariableTransfer> | undefined;
    try {
        const context = readContext(payload.modeId, helpers);
        const expected = payload.context;
        const editor = helpers.readBinding('LogicEditor') as LogicEditorMainWorld;
        const renderer = helpers.readBinding('LogicRenderer') as LogicRendererMainWorld;
        const jq = helpers.readBinding('$') as DivTabHostMainWorld;
        const area = helpers.unwrapElement(jq.divTab!('.logic_area')) as HTMLElement;
        const host = area.ownerDocument.getElementById('lamp7-genie-logic-edit');
        if (
            !expected ||
            context.tabKey !== expected.tabKey ||
            context.ownerId !== expected.ownerId ||
            context.signature !== expected.signature ||
            host?.dataset.pasteMode !== payload.modeId ||
            host.dataset.pastePhase !== 'committing' ||
            area.getAttribute('data-genie-paste-mode') !== payload.modeId
        )
            throw Error('붙여넣을 화면이 변경되었습니다. 위치를 다시 선택해 주세요.');

        // Preparation already finished native editing. If it resumed during picking,
        // reject without committing more input or creating into a stale context.
        if (area.querySelector('.head-logic.editable'))
            throw Error('로직 편집 상태가 변경되었습니다. 붙여넣을 위치를 다시 선택해 주세요.');

        const all = editor.getAll() as Lamp7Logic[];
        const byId = new Map(all.map((logic) => [String(logic.getId?.()), logic]));
        const element = (logic: Lamp7Logic | undefined) =>
            helpers.unwrapElement(logic?.getElement?.()) as HTMLElement | null;
        const { anchorId, position } = payload.location;
        const anchor = byId.get(anchorId);
        const anchorEl = element(anchor);
        let container: HTMLElement = area;
        let before: Element | null = null;
        let parentId = '';
        if (position === 'inside') {
            if (!context.rows.find((row) => row.id === anchorId)?.canNest || !anchorEl)
                throw Error('하위 로직을 넣을 수 없는 위치입니다.');
            container = Array.from(anchorEl.querySelectorAll<HTMLElement>('[id]')).find(
                (el) => el.id === `${anchorId}_processLogic`,
            )!;
            parentId = anchorId;
        } else if (position === 'after') {
            if (!anchorEl || !area.contains(anchorEl)) throw Error('대상 로직을 찾을 수 없습니다.');
            container = anchorEl.parentElement!;
            before = anchorEl.nextElementSibling;
            parentId = String(anchor?.parentId || '');
        } else if (position === 'root-start' || position === 'root-end') {
            if (anchorId) throw Error('잘못된 붙여넣기 위치입니다.');
            if (position === 'root-start') before = area.firstElementChild;
        } else throw Error('붙여넣을 위치를 선택해 주세요.');
        if (!container || !area.contains(container)) throw Error('대상 영역을 찾을 수 없습니다.');
        if (
            typeof (helpers.readBinding('Sortable') as { get?: unknown } | undefined)?.get !==
                'function' ||
            typeof (helpers.readBinding('LogicEventHandler') as LogicEventHandlerMainWorld)
                ?.setLogicBlockNestedSortable !== 'function'
        )
            throw Error('Lamp7 기본 로직 이동 기능을 찾을 수 없습니다.');

        // Validate the copied forest before creation; a failed copied parent never falls back to root.
        variables = transferVariables?.(
            payload.logics as Record<string, unknown>[],
            helpers.readBinding,
            'paste',
        );
        const copies = new Map<string, Record<string, unknown>>();
        for (const value of variables?.logics ?? payload.logics) {
            if (!value || typeof value !== 'object' || Array.isArray(value))
                throw Error('복사 데이터가 올바르지 않습니다.');
            const raw = value as Record<string, unknown>,
                id = helpers.asStringId(raw.id);
            if (!id || copies.has(id)) throw Error('복사한 로직 ID가 없거나 중복됩니다.');
            if (
                ![
                    'event',
                    'transaction',
                    'systemfunction',
                    'condition',
                    'variable',
                    'iteration',
                    'control',
                ].includes(String(raw.type))
            )
                throw Error('지원하지 않는 로직 유형입니다.');
            copies.set(id, raw);
        }
        if (!copies.size) throw Error('붙여넣을 로직이 없습니다.');
        const sorted: Record<string, unknown>[] = [],
            visiting = new Set<string>(),
            visited = new Set<string>();
        const visit = (id: string) => {
            if (visited.has(id)) return;
            if (visiting.has(id)) throw Error('복사한 로직의 부모 연결이 순환합니다.');
            visiting.add(id);
            const raw = copies.get(id)!,
                parent = helpers.asStringId(raw.parentId);
            if (copies.has(parent)) {
                if (!['condition', 'iteration'].includes(String(copies.get(parent)!.type)))
                    throw Error('하위 로직을 가질 수 없는 복사 데이터입니다.');
                visit(parent);
            }
            visiting.delete(id);
            visited.add(id);
            sorted.push(raw);
        };
        [...copies.values()]
            .sort((a, b) => (Number(a.seq) || 0) - (Number(b.seq) || 0))
            .forEach((raw) => visit(helpers.asStringId(raw.id)));
        const oldLinks = new Map(
            all.map((logic) => [
                logic,
                (logic as Lamp7Logic & { parentTranId?: unknown }).parentTranId,
            ]),
        );
        const affected = new Set<Lamp7Logic>();
        const add = (logic: unknown) => {
            if (logic && typeof (logic as Lamp7Logic).getId === 'function')
                affected.add(logic as Lamp7Logic);
        };
        const neighbors = (logic: Lamp7Logic) => {
            add(logic);
            add(logic.getPrev?.());
            add(logic.getNext?.());
            logic.getParent?.().forEach(add);
        };
        if (anchor) neighbors(anchor);
        const boundary =
            position === 'root-start' ? area.firstElementChild : container.lastElementChild;
        add(byId.get(boundary?.id || ''));
        host!.dataset.pastePhase = 'consumed';
        variables?.apply();
        const idMap = new Map<string, string>();
        const roots: CreatedLamp7Logic[] = [];
        for (const raw of sorted) {
            const oldId = helpers.asStringId(raw.id),
                oldParent = helpers.asStringId(raw.parentId);
            try {
                const nested = copies.has(oldParent);
                const newParent = nested ? idMap.get(oldParent) : parentId;
                if (nested && !newParent) throw Error('부모 로직을 생성하지 못했습니다.');
                // Native constructors retain nested objects: isolate the clipboard snapshot.
                const props = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;
                props.id = '';
                props.varPrefix = '';
                props.parentId = newParent || '';
                const logic = editor.createLogic!('', String(raw.type), '', props);
                created.push(logic);
                const newId = helpers.asStringId(logic.getId());
                if (!newId) throw Error('생성한 로직 ID를 확인할 수 없습니다.');
                idMap.set(oldId, newId);
                if (!nested) roots.push(logic);
            } catch (error) {
                errors.push({
                    oldId,
                    error: error instanceof Error ? error.message : String(error),
                });
            }
        }
        if (created.length) {
            // Native rendering owns row creation. No derived renderer receiver or
            // global reader replacement: upstream rendering failures stay visible.
            try {
                renderer.renderLogics(created);
            } catch (error) {
                const stack =
                    error && typeof error === 'object' && 'stack' in error
                        ? String(error.stack)
                        : '';
                const connector = (
                    renderer as LogicRendererMainWorld & {
                        connectConditionLogic?: (items: unknown[]) => void;
                    }
                ).connectConditionLogic;
                // Local Lamp7's connector indexes a subset using global sequence
                // numbers. Recover only that final stage, after all rows exist.
                if (
                    !stack.includes('connectConditionLogic') ||
                    typeof connector !== 'function' ||
                    created.some((logic) => !element(logic) || !area.contains(element(logic)))
                )
                    throw error;
                connector.call(renderer, editor.getAll());
            }
            const handler = helpers.readBinding('LogicEventHandler') as LogicEventHandlerMainWorld;
            const currentToggle = helpers.unwrapElement(
                jq.divTab!('#' + context.tabKey + 'logicMoveToggle'),
            );
            handler?.setLogicBlockNestedSortable?.({
                disabled: !currentToggle?.classList.contains('move-on'),
            });
            type Sorter = {
                toArray(): string[];
                sort(ids: string[], animate?: boolean): void;
                option(name: string, value?: unknown): unknown;
                options: { onStart?: (event: unknown) => void; onEnd?: (event: unknown) => void };
            };
            const sortable = (
                helpers.readBinding('Sortable') as { get(el: HTMLElement): Sorter } | undefined
            )?.get(container);
            if (
                !sortable?.sort ||
                !sortable.option ||
                !sortable.options.onStart ||
                !sortable.options.onEnd
            )
                throw Error('Lamp7 기본 로직 이동 기능을 찾을 수 없습니다.');
            const elements = Array.from(container.children);
            const rootElements = roots.map((logic) => element(logic));
            if (rootElements.some((el) => !el || el.parentElement !== container))
                throw Error('생성한 로직이 대상 부모 아래에 없습니다.');
            const ordered = elements.filter((el) => !rootElements.includes(el as HTMLElement));
            const at = before ? ordered.indexOf(before) : ordered.length;
            if (at < 0) throw Error('붙여넣을 위치가 변경되었습니다.');
            ordered.splice(at, 0, ...(rootElements as HTMLElement[]));
            const event = {
                item: rootElements[0],
                items: rootElements,
                from: container,
                to: container,
            };
            // Same lifecycle as Lamp7 drag: capture affected neighbors, native sort,
            // then native onEnd updates levels, parents, transactions and validation.
            // Sortable's fallback hashes can collide for identical logic captions.
            // Temporary Genie UI markers give its public sort API unique keys.
            const marker = 'data-genie-sort-key';
            const oldAttribute = sortable.option('dataIdAttr');
            const previousMarkers = elements.map((el) => el.getAttribute(marker));
            try {
                elements.forEach((el, i) => el.setAttribute(marker, String(i)));
                sortable.option('dataIdAttr', marker);
                const ids = sortable.toArray();
                if (ids.length !== elements.length || new Set(ids).size !== ids.length)
                    throw Error('로직 이동 순서를 확인할 수 없습니다.');
                sortable.options.onStart.call(sortable, event);
                sortable.sort(
                    ordered.map((el) => ids[elements.indexOf(el)]),
                    false,
                );
                sortable.options.onEnd.call(sortable, event);
            } finally {
                sortable.option('dataIdAttr', oldAttribute);
                elements.forEach((el, i) => {
                    const value = previousMarkers[i];
                    if (value === null) el.removeAttribute(marker);
                    else el.setAttribute(marker, value);
                });
                const toggle = helpers.unwrapElement(
                    jq.divTab!('#' + context.tabKey + 'logicMoveToggle'),
                );
                handler.setLogicBlockNestedSortable?.({
                    disabled: !toggle?.classList.contains('move-on'),
                });
            }
            if (ordered.some((el, i) => container.children[i] !== el))
                throw Error('기본 로직 이동 결과가 요청한 위치와 다릅니다.');
            if (position === 'inside') anchor?.expand?.();
            created.forEach(neighbors);
            for (const logic of all) {
                if (
                    oldLinks.get(logic) !==
                    (logic as Lamp7Logic & { parentTranId?: unknown }).parentTranId
                )
                    add(logic);
            }
            for (const logic of affected) {
                logic.getChildren?.().forEach(add);
                (logic as Lamp7Logic & { getBundle?: () => Lamp7Logic[] })
                    .getBundle?.()
                    .forEach(add);
            }
            for (const logic of affected) {
                try {
                    logic.validate?.();
                } catch {
                    validationWarnings++;
                }
            }
            for (const logic of created) {
                try {
                    if (logic.validateLoadCompelete?.() === false)
                        (
                            helpers.readBinding('LogicUtils') as {
                                showError?: (logic: Lamp7Logic) => void;
                            }
                        )?.showError?.(logic);
                } catch {
                    validationWarnings++;
                }
            }
            const toggle = helpers.unwrapElement(
                jq.divTab!('#' + context.tabKey + 'logicMoveToggle'),
            );
            (
                helpers.readBinding('LogicEventHandler') as LogicEventHandlerMainWorld
            )?.setLogicBlockNestedSortable?.({ disabled: !toggle?.classList.contains('move-on') });
        }
        if (!created.length) variables?.rollback();
        return { createdCount: created.length, errors, validationWarnings };
    } catch (error) {
        if (!created.length) {
            try {
                variables?.rollback();
            } catch {
                validationWarnings++;
            }
        }
        return {
            createdCount: created.length,
            errors,
            setupError: `${created.length ? '일부 로직 생성 후 중단했습니다. ' : ''}${error instanceof Error ? error.message : String(error)}`,
        };
    }
}
