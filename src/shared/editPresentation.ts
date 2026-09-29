import { createContext } from 'react';
import type { PanelNotice } from './panelNotice';

/** Presentation only: hiding the panel must never dispose the edit controller. */
export const EditPresentation = createContext<{
    compact: boolean;
    setCompact(value: boolean): void;
    notice: PanelNotice | null;
    clearNotice(): void;
} | null>(null);
