import {
    CONTAINER_ID,
    ENABLED_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    OBSERVER_OPTIONS,
    VIDEO_EVENTS,
    ZEN_MODE_STORAGE_KEY,
    ZEN_MODE_STYLE_ID
} from './constants.js';
import { createContainer } from './ui.js';
import {
    applyThemeToUi,
    getThemePalette,
    handleThemeChange,
    syncZenButtonAppearance,
    watchThemeChanges
} from './theme.js';
import { state, themeState, ui } from './state.js';
import {
    attachShortcutListener,
    handleAddButtonClick,
    handleDelete,
    handleSave,
    handleTooltipKeydown,
    handleTrackClick,
    handleTrackMouseLeave,
    handleTrackMouseMove,
    renderNotesTrack,
    setEnsureUiReady
} from './notes.js';
import { attachResponsiveListeners, closeTooltip, hideNotePreview } from './tooltip.js';
import { getVideoElement, getVideoIdFromLocation } from './utils.js';
import {
    getNotesEnabledSetting,
    getVideoTitleText,
    getZenModeSetting,
    loadNotesForVideo,
    persistVideoMetadata,
    persistZenModeSetting,
    resolveEnabledSetting,
    resolveZenModeSetting
} from './storage.js';

const ZEN_MODE_STYLE = `
    #primary {
        min-width: 98% !important;
    }

    #secondary,
    ytd-merch-shelf-renderer,
    #comments,
    #bottom-row {
        display: none !important;
    }
`;

let zenStyleElement: HTMLStyleElement | null = null;
let theaterModeTimeout: number | null = null;

const isTheaterModeActive = (): boolean => {
    const flexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
    if (!flexy) {
        return false;
    }

    return (
        flexy.hasAttribute('theater') ||
        flexy.getAttribute('theater') === '' ||
        flexy.classList.contains('theater') ||
        flexy.classList.contains('theater-mode')
    );
};

const enableTheaterMode = (): void => {
    if (isTheaterModeActive()) {
        return;
    }

    const sizeButton = document.querySelector<HTMLButtonElement>('.ytp-size-button');
    if (sizeButton) {
        sizeButton.click();
        return;
    }

    const flexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
    if (flexy) {
        flexy.setAttribute('theater', '');
        flexy.classList.add('theater', 'theater-mode');
    }
};

const disableTheaterMode = (): void => {
    if (!isTheaterModeActive()) {
        return;
    }

    const sizeButton = document.querySelector<HTMLButtonElement>('.ytp-size-button');
    if (sizeButton) {
        sizeButton.click();
        return;
    }

    const flexy = document.querySelector<HTMLElement>('ytd-watch-flexy');
    if (flexy) {
        flexy.removeAttribute('theater');
        flexy.classList.remove('theater', 'theater-mode');
    }
};

const clearTheaterModeEnforcement = (): void => {
    if (theaterModeTimeout !== null) {
        window.clearTimeout(theaterModeTimeout);
        theaterModeTimeout = null;
    }
};

const enforceTheaterMode = (desired: boolean, attempts = 6): void => {
    clearTheaterModeEnforcement();

    const attemptToggle = (remaining: number): void => {
        const active = isTheaterModeActive();
        if (active === desired) {
            theaterModeTimeout = null;
            return;
        }

        if (desired) {
            enableTheaterMode();
        } else {
            disableTheaterMode();
        }

        if (remaining <= 0) {
            theaterModeTimeout = null;
            return;
        }

        theaterModeTimeout = window.setTimeout(() => attemptToggle(remaining - 1), 300);
    };

    attemptToggle(attempts);
};

const applyZenModeStyles = (isEnabled: boolean): void => {
    if (isEnabled) {
        if (!zenStyleElement || !zenStyleElement.isConnected) {
            const existing = document.getElementById(ZEN_MODE_STYLE_ID);
            if (existing instanceof HTMLStyleElement) {
                zenStyleElement = existing;
            }
        }

        if (!zenStyleElement || !zenStyleElement.isConnected) {
            const styleElement = document.createElement('style');
            styleElement.id = ZEN_MODE_STYLE_ID;
            styleElement.type = 'text/css';
            const target = document.head || document.documentElement || document.body;
            if (target) {
                target.appendChild(styleElement);
            }
            zenStyleElement = styleElement;
        }

        if (zenStyleElement) {
            zenStyleElement.textContent = ZEN_MODE_STYLE;
        }
        return;
    }

    if (!zenStyleElement || !zenStyleElement.isConnected) {
        const existing = document.getElementById(ZEN_MODE_STYLE_ID);
        if (existing instanceof HTMLStyleElement) {
            zenStyleElement = existing;
        }
    }

    if (zenStyleElement && zenStyleElement.parentElement) {
        zenStyleElement.parentElement.removeChild(zenStyleElement);
    }
    zenStyleElement = null;
};

const applyZenModeState = (isEnabled: boolean): void => {
    state.isZenModeEnabled = isEnabled;
    applyZenModeStyles(isEnabled);
    syncZenButtonAppearance(themeState.palette);
    if (isEnabled) {
        enforceTheaterMode(true);
    } else {
        enforceTheaterMode(false);
    }
};

const updateZenModeSetting = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isZenModeEnabled;
    applyZenModeState(isEnabled);

    try {
        await persistZenModeSetting(isEnabled);
    } catch {
        applyZenModeState(previousValue);
    }
};

const handleZenButtonClick = (): void => {
    updateZenModeSetting(!state.isZenModeEnabled).catch(() => {});
};

const attachUiListeners = (): void => {
    const { addButton, zenButton, tooltip, cancelButton, saveButton, deleteButton, track } = ui;
    if (!addButton || !zenButton || !tooltip || !cancelButton || !saveButton || !deleteButton || !track) {
        return;
    }

    addButton.addEventListener('click', handleAddButtonClick);
    zenButton.addEventListener('click', handleZenButtonClick);
    cancelButton.addEventListener('click', closeTooltip);
    saveButton.addEventListener('click', handleSave);
    deleteButton.addEventListener('click', handleDelete);
    tooltip.addEventListener('keydown', handleTooltipKeydown);
    track.addEventListener('mousemove', handleTrackMouseMove);
    track.addEventListener('mouseleave', handleTrackMouseLeave);
    track.addEventListener('click', handleTrackClick);
};

const detachVideoListeners = (): void => {
    const currentVideo = state.video;
    if (!currentVideo) {
        return;
    }

    VIDEO_EVENTS.forEach((eventName) => {
        currentVideo.removeEventListener(eventName, handleVideoMetadata);
    });
};

const handleVideoMetadata = (): void => {
    renderNotesTrack();
};

const assignVideoElement = (): HTMLVideoElement | null => {
    const video = getVideoElement();
    if (state.video === video) {
        return video;
    }

    detachVideoListeners();
    state.video = video;

    if (video) {
        VIDEO_EVENTS.forEach((eventName) => {
            video.addEventListener(eventName, handleVideoMetadata);
        });

        if (Number.isFinite(video.duration) && video.duration > 0) {
            renderNotesTrack();
        }
    } else {
        renderNotesTrack();
    }

    return video;
};

const refreshNotesForCurrentVideo = async (options: { forceReload?: boolean } = {}): Promise<void> => {
    const { forceReload = false } = options;
    if (!state.isEnabled) {
        return;
    }

    const videoId = getVideoIdFromLocation();
    if (!videoId) {
        if (state.videoId !== null) {
            detachVideoListeners();
            state.video = null;
        }
        state.videoId = null;
        state.notes = [];
        renderNotesTrack();
        closeTooltip();
        return;
    }

    const shouldReloadNotes = forceReload || state.videoId !== videoId;

    if (!shouldReloadNotes) {
        assignVideoElement();
        renderNotesTrack();
        return;
    }

    const notes = await loadNotesForVideo(videoId);
    if (getVideoIdFromLocation() !== videoId) {
        return;
    }

    state.videoId = videoId;
    state.notes = notes;
    if (notes.length > 0) {
        await persistVideoMetadata(videoId, {
            title: getVideoTitleText(),
            noteCount: notes.length
        });
    } else {
        await persistVideoMetadata(videoId, null);
    }
    assignVideoElement();
    renderNotesTrack();
    closeTooltip();
};

const locateTitleContainer = (): Element | null =>
    document.querySelector('#primary-inner ytd-watch-metadata #title');

const insertContainer = (): boolean => {
    const player = document.getElementById('player');
    const titleContainer = locateTitleContainer();
    const metadataContainer = titleContainer ? titleContainer.parentElement : null;

    if (!player || !titleContainer || !metadataContainer) {
        return false;
    }

    if (document.getElementById(CONTAINER_ID)) {
        return true;
    }

    const palette = getThemePalette();
    const elements = createContainer(palette);
    ui.container = elements.container;
    ui.addButton = elements.addButton;
    ui.zenButton = elements.zenButton;
    ui.track = elements.track;
    ui.trackBaseline = elements.trackBaseline;
    ui.emptyState = elements.emptyState;
    ui.tooltip = elements.tooltip;
    ui.heading = elements.heading;
    ui.timestampLabel = elements.timestampLabel;
    ui.textarea = elements.textarea;
    ui.deleteButton = elements.deleteButton;
    ui.cancelButton = elements.cancelButton;
    ui.saveButton = elements.saveButton;
    ui.previewTooltip = elements.previewTooltip;
    ui.previewText = elements.previewText;
    ui.trackHoverTooltip = elements.trackHoverTooltip;

    if (!elements.container) {
        return false;
    }

    metadataContainer.insertBefore(elements.container, titleContainer);
    applyThemeToUi(palette);
    attachUiListeners();
    return true;
};

const ensureUiReady = (videoIdOverride?: string): boolean => {
    if (!state.isEnabled) {
        return false;
    }

    const videoId = typeof videoIdOverride === 'string' ? videoIdOverride : getVideoIdFromLocation();
    if (!videoId) {
        return false;
    }

    const ready = insertContainer();
    if (!ready) {
        return false;
    }

    assignVideoElement();
    renderNotesTrack();
    return true;
};

setEnsureUiReady(ensureUiReady);

const teardownUi = (): void => {
    closeTooltip();
    hideNotePreview();
    observer.disconnect();
    detachVideoListeners();
    clearTheaterModeEnforcement();

    const container = ui.container;
    if (container && container.parentElement) {
        container.remove();
    }

    ui.container = null;
    ui.addButton = null;
    ui.zenButton = null;
    ui.track = null;
    ui.trackBaseline = null;
    ui.tooltip = null;
    ui.textarea = null;
    ui.deleteButton = null;
    ui.cancelButton = null;
    ui.saveButton = null;
    ui.heading = null;
    ui.timestampLabel = null;
    ui.emptyState = null;
    ui.previewTooltip = null;
    ui.previewText = null;
    ui.trackHoverTooltip = null;

    state.video = null;
    state.videoId = null;
    state.notes = [];
    state.tooltipMode = null;
    state.activeNoteId = null;
    state.pendingTimestamp = null;
    state.tooltipAnchor = null;
    state.previewAnchor = null;
    state.previewNoteId = null;
    state.resumePlaybackVideo = null;
};

const observer = new MutationObserver(() => {
    if (ensureUiReady()) {
        observer.disconnect();
    }
});

const startObserving = (): void => {
    if (!document.body) {
        return;
    }

    if (!state.isEnabled) {
        return;
    }

    observer.disconnect();
    observer.observe(document.body, OBSERVER_OPTIONS);
};

const handleRouteChange = (): void => {
    if (!state.isEnabled) {
        teardownUi();
        return;
    }

    if (state.isZenModeEnabled) {
        applyZenModeStyles(true);
        enforceTheaterMode(true);
    }

    refreshNotesForCurrentVideo().catch(() => {});
    const videoId = getVideoIdFromLocation();
    if (!videoId) {
        observer.disconnect();
        return;
    }

    if (!ensureUiReady(videoId)) {
        startObserving();
    }
};

const applyEnabledState = (isEnabled: boolean): void => {
    state.isEnabled = isEnabled;
    if (!isEnabled) {
        teardownUi();
        return;
    }

    handleRouteChange();
};

const handleStorageChange = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string
): void => {
    if (areaName !== 'local') {
        return;
    }

    if (changes[ENABLED_STORAGE_KEY]) {
        const nextEnabled = resolveEnabledSetting(changes[ENABLED_STORAGE_KEY].newValue);
        applyEnabledState(nextEnabled);
    }

    if (changes[ZEN_MODE_STORAGE_KEY]) {
        const nextZenMode = resolveZenModeSetting(changes[ZEN_MODE_STORAGE_KEY].newValue);
        applyZenModeState(nextZenMode);
    }

    if (!state.isEnabled) {
        return;
    }

    const notesChange = changes[NOTES_STORAGE_KEY];
    if (!notesChange) {
        return;
    }

    const videoId = state.videoId;
    if (!videoId) {
        return;
    }

    const hasNew =
        notesChange.newValue &&
        typeof notesChange.newValue === 'object' &&
        Object.prototype.hasOwnProperty.call(notesChange.newValue, videoId);
    const hasOld =
        notesChange.oldValue &&
        typeof notesChange.oldValue === 'object' &&
        Object.prototype.hasOwnProperty.call(notesChange.oldValue, videoId);

    if (!hasNew && !hasOld) {
        return;
    }

    refreshNotesForCurrentVideo({ forceReload: true }).catch(() => {});
};

const initialize = async (): Promise<void> => {
    attachResponsiveListeners();
    attachShortcutListener();
    watchThemeChanges();
    handleThemeChange();

    const [isEnabled, isZenModeEnabled] = await Promise.all([getNotesEnabledSetting(), getZenModeSetting()]);
    applyZenModeState(isZenModeEnabled);
    applyEnabledState(isEnabled);

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(handleStorageChange);
        window.addEventListener('unload', () => {
            chrome.storage.onChanged.removeListener(handleStorageChange);
        });
    }
};

export { handleRouteChange, initialize };
