import { bootstrapTopFramePanel } from './topFrameBootstrap';
import { registerFrameMessageHandlers } from './frameMessageHandlers';
import { unmountEdit } from '../features/edit';
import './content.css';

if (window === window.top) {
    bootstrapTopFramePanel();
}

registerFrameMessageHandlers();

window.addEventListener('pagehide', () => {
    unmountEdit();
});
