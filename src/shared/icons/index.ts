import type { FunctionComponent, SVGProps } from 'react';
import type { LogicKind } from '../types/messages';
import ConditionIcon from './condition.svg?react';
import ControlIcon from './control.svg?react';
import EventIcon from './event.svg?react';
import LoopIcon from './loop.svg?react';
import TransactionIcon from './transaction.svg?react';
import VariableIcon from './variable.svg?react';

export type IconComponent = FunctionComponent<SVGProps<SVGSVGElement>>;

// LogicKind → 아이콘. iteration은 loop.svg 사용.
export const KIND_ICON: Record<LogicKind, IconComponent> = {
    event: EventIcon,
    transaction: TransactionIcon,
    condition: ConditionIcon,
    variable: VariableIcon,
    iteration: LoopIcon,
    control: ControlIcon,
};

export {
    EventIcon,
    TransactionIcon,
    ConditionIcon,
    VariableIcon,
    LoopIcon,
    ControlIcon,
};
