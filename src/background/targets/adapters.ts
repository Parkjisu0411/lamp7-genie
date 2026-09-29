import type { TargetContext, TargetKind } from '../../shared/targets/types';

export interface TargetAdapter {
    kind: TargetKind;
    label: string;
    capabilities: TargetContext['capabilities'];
}

export const targetAdapters: Record<TargetKind, TargetAdapter> = {
    logic: { kind: 'logic', label: 'Logic', capabilities: { search: true, edit: true } },
    // Visual edit currently exposes selection only; destructive commands remain Logic-only.
    visual: { kind: 'visual', label: 'Visual editor', capabilities: { search: true, edit: true } },
};
