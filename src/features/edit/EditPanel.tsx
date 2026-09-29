import { EditWorkspace, type EditWorkspaceItem } from '../../shared/EditWorkspace';
import { KIND_ICON } from '../../shared/icons';
import type { NotifyPanel } from '../../shared/panelNotice';
import type { EditListItem } from './useEditClipboard';
import { useEditPanel } from './useEditPanel';

const kinds = {
    event: '이벤트',
    transaction: '트랜잭션',
    condition: '조건',
    variable: '변수',
    iteration: '반복',
    control: '제어',
};
const itemRow = (item: EditListItem): EditWorkspaceItem => {
    const Icon = KIND_ICON[item.kind];
    return {
        key: item.logicId,
        type: kinds[item.kind],
        icon: <Icon aria-hidden="true" focusable="false" />,
        seq: item.seq,
        label: item.snippet?.trim() || '',
        id: item.logicId,
    };
};
export function EditPanel({
    notify,
    clearNotice,
}: {
    eventSettingAvailable: boolean;
    notify: NotifyPanel;
    clearNotice(): void;
}) {
    const panel = useEditPanel({ notify, clearNotice });
    return (
        <EditWorkspace
            active={panel.isSelecting}
            pasting={panel.isPasting}
            busy={panel.busy}
            items={panel.selectedItems.map(itemRow)}
            copied={panel.copiedItems.map(itemRow)}
            onStart={panel.handleStartSelection}
            onStop={panel.handleEndSelection}
            onCopy={panel.handleCopySelected}
            onDelete={panel.handleDeleteSelected}
            onPaste={panel.handlePasteCopied}
            onClear={panel.handleClearSelection}
            onDeselect={panel.handleDeselect}
        />
    );
}
