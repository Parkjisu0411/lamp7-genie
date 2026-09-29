import type {
    DivTabHostMainWorld,
    Lamp7Logic,
    LogicEditorMainWorld,
    MainWorldHelperSubset,
} from '../../../shared/mainWorld/logicTypes';
import type { LogicPasteContext } from '../pasteTypes';

/** Self-contained: also injected alongside the paste function. */
export function readLogicPasteContext(
    modeId: string,
    helpers: MainWorldHelperSubset<'readBinding' | 'unwrapElement'>,
): LogicPasteContext {
    const editor = helpers.readBinding('LogicEditor') as LogicEditorMainWorld;
    const renderer = helpers.readBinding('LogicRenderer') as { renderLogics?: unknown };
    const jq = helpers.readBinding('$') as DivTabHostMainWorld;
    if (
        !modeId ||
        !editor?.getAll ||
        !editor.createLogic ||
        !editor.resetLogicLevelAndSeqAll ||
        typeof renderer?.renderLogics !== 'function' ||
        !jq?.divTab
    )
        throw Error('로직 붙여넣기를 지원하지 않는 화면입니다.');
    const area = helpers.unwrapElement(jq.divTab('.logic_area'));
    if (!area?.isConnected || !area.getClientRects().length)
        throw Error('처리로직 영역을 열어 주세요.');
    const all = editor.getAll() as Lamp7Logic[];
    const rows = all.map((logic) => {
        const id = String(logic.getId?.() || '');
        const el = helpers.unwrapElement(logic.getElement?.());
        if (!id || !el || !area.contains(el))
            throw Error('로직 화면이 변경되었습니다. 다시 시도해 주세요.');
        const type = logic.getType?.();
        const next = logic.getNext?.() as Lamp7Logic | undefined;
        const nextPrefix = (next?.condition as { prefix?: string })?.prefix;
        // Native add buttons are only exposed on the last member of an AND/OR bundle.
        const canNest =
            (type === 'condition' || type === 'iteration') &&
            !(type === 'condition' && ['and', 'or'].includes(nextPrefix || '')) &&
            !!Array.from(el.querySelectorAll('[id]')).find((n) => n.id === `${id}_processLogic`);
        return { id, canNest };
    });
    const owner = helpers.unwrapElement(jq.divTab('#id')) as HTMLInputElement | null;
    return {
        modeId,
        tabKey: String(helpers.readBinding('_tabId_') ?? ''),
        ownerId: String(owner?.value ?? ''),
        signature: JSON.stringify(
            all.map((logic) => [
                logic.getId?.(),
                logic.getType?.(),
                logic.parentId,
                logic.seq,
                logic.lvl,
                (logic.condition as { prefix?: string })?.prefix,
            ]),
        ),
        rows,
    };
}

/** Like native clickLogicAdd: finish current input before mounting the paste shield. */
export function prepareLogicPasteContext(
    modeId: string,
    helpers: MainWorldHelperSubset<'readBinding' | 'unwrapElement'>,
    readContext: typeof readLogicPasteContext,
): LogicPasteContext {
    // Validate the supported editor and all model/DOM ownership before native calls.
    const before = readContext(modeId, helpers);
    const editor = helpers.readBinding('LogicEditor') as LogicEditorMainWorld;
    const jq = helpers.readBinding('$') as DivTabHostMainWorld;
    const area = helpers.unwrapElement(jq.divTab!('.logic_area'))!;
    if (!area.querySelector('.head-logic.editable')) return before;

    for (const logic of editor.getAll() as Lamp7Logic[]) {
        if (logic.setDisable?.() === false)
            throw Error('로직 입력값을 확인한 뒤 다시 시도해 주세요.');
    }
    // Missing APIs or an unfinished condition bundle must not discard active input.
    if (area.querySelector('.head-logic.editable'))
        throw Error('로직 편집을 종료하지 못했습니다. 입력값을 확인해 주세요.');

    // Native validation can commit fields and update the condition bundle.
    const after = readContext(modeId, helpers);
    if (after.tabKey !== before.tabKey || after.ownerId !== before.ownerId)
        throw Error('붙여넣을 화면이 변경되었습니다. 다시 시도해 주세요.');
    return after;
}
