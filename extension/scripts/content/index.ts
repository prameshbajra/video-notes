import { handleRouteChange, initialize } from './lifecycle.js';
import { state } from './state.js';

initialize().catch(() => {
    state.isEnabled = true;
    handleRouteChange();
});

['yt-navigate-finish', 'yt-page-data-updated'].forEach((eventName) => {
    window.addEventListener(eventName, handleRouteChange);
});
