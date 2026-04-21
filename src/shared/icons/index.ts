import type { FunctionComponent, SVGProps } from 'react';
import type { SearchMatchKind } from '../types/messages';
import EventIcon from './event.svg?react';
import TransactionIcon from './transaction.svg?react';
import ConditionIcon from './condition.svg?react';
import VariableIcon from './variable.svg?react';

export type IconComponent = FunctionComponent<SVGProps<SVGSVGElement>>;

// SearchMatchKind 값과 동일한 파일명을 맞춰두어 kind → 아이콘 매핑이 1:1로 연결됨.
export const KIND_ICON: Record<SearchMatchKind, IconComponent> = {
    event: EventIcon,
    transaction: TransactionIcon,
    condition: ConditionIcon,
    variable: VariableIcon,
};

export { EventIcon, TransactionIcon, ConditionIcon, VariableIcon };
