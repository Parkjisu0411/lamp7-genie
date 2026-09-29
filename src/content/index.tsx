import { registerPasteProgress } from './pasteProgress';
import { bootstrapTopFramePanel } from './topFrameBootstrap';
import { registerFrameMessageHandlers } from './frameMessageHandlers';
import { unmountEdit } from '../features/edit';
import './content.css';
import { observeTargetContext } from './targetObserver';

if (window === window.top) {
    bootstrapTopFramePanel();
}

registerFrameMessageHandlers();
registerPasteProgress();
observeTargetContext();

window.addEventListener('pagehide', () => {
    unmountEdit();
});
