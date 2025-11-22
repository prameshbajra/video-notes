const CONTAINER_ID = 'video-notes-container';
const TRACK_ID = 'video-notes-track';
const TOOLTIP_ID = 'video-notes-tooltip';
const PREVIEW_TOOLTIP_ID = 'video-notes-preview';
const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const OBSERVER_OPTIONS = { childList: true, subtree: true };
const VIDEO_EVENTS = ['loadedmetadata', 'durationchange'];
const TOOLTIP_OFFSET = 12;
const PREVIEW_OFFSET = 8;

const state = {
    video: null,
    videoId: null,
    notes: [],
    tooltipMode: null,
    activeNoteId: null,
    pendingTimestamp: null,
    tooltipAnchor: null,
    previewAnchor: null,
    previewNoteId: null,
    previewAnchor: null,
    previewNoteId: null,
    resumePlaybackVideo: null,
    zenMode: false
};

const ui = {
    container: null,
    addButton: null,
    zenButton: null,
    track: null,
    trackBaseline: null,
    tooltip: null,
    textarea: null,
    cancelButton: null,
    saveButton: null,
    deleteButton: null,
    heading: null,
    timestampLabel: null,
    emptyState: null,
    previewTooltip: null,
    previewText: null
};

const themePalettes = {
    dark: {
        textPrimary: '#f1f1f1',
        textSecondary: '#aaaaaa',
        surfaceMuted: 'rgba(255, 255, 255, 0.06)',
        surfaceBorder: '1px solid rgba(255, 255, 255, 0.08)',
        surfaceBaseline: 'rgba(255, 255, 255, 0.2)',
        tooltipBackground: '#202124',
        tooltipText: '#ffffff',
        tooltipShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        textareaBackground: '#121212',
        textareaText: '#ffffff',
        textareaBorder: '1px solid #3f3f3f',
        deleteText: '#ff7b7b',
        deleteBorder: '1px solid rgba(255, 123, 123, 0.6)',
        cancelText: '#aaaaaa',
        previewBackground: 'rgba(32, 33, 36, 0.95)',
        previewBorder: '1px solid rgba(255, 255, 255, 0.08)',
        previewShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        previewText: '#ffffff',
        noteDotBorder: '1px solid rgba(10, 28, 46, 0.6)',
        noteDotShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
        noteDotShadowActive: '0 6px 14px rgba(62, 166, 255, 0.5)'
    },
    light: {
        textPrimary: '#0f0f0f',
        textSecondary: '#606060',
        surfaceMuted: 'rgba(0, 0, 0, 0.04)',
        surfaceBorder: '1px solid rgba(0, 0, 0, 0.08)',
        surfaceBaseline: 'rgba(0, 0, 0, 0.15)',
        tooltipBackground: '#ffffff',
        tooltipText: '#0f0f0f',
        tooltipShadow: '0 12px 30px rgba(15, 23, 42, 0.16)',
        textareaBackground: '#ffffff',
        textareaText: '#0f0f0f',
        textareaBorder: '1px solid rgba(0, 0, 0, 0.12)',
        deleteText: '#b3261e',
        deleteBorder: '1px solid rgba(179, 38, 30, 0.35)',
        cancelText: '#5f6368',
        previewBackground: 'rgba(255, 255, 255, 0.98)',
        previewBorder: '1px solid rgba(15, 23, 42, 0.08)',
        previewShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
        previewText: '#202124',
        noteDotBorder: '1px solid rgba(10, 28, 46, 0.25)',
        noteDotShadow: '0 3px 8px rgba(15, 23, 42, 0.16)',
        noteDotShadowActive: '0 6px 14px rgba(62, 166, 255, 0.4)'
    }
};

const themeState = {
    mode: null,
    palette: themePalettes.dark
};

let themeObserver = null;
let themeMediaQuery = null;
let themeAppObserver = null;

let globalListenersAttached = false;
let shortcutListenerAttached = false;
let tooltipDismissCleanup = null;

const applyStyles = (element, styles) => {
    Object.assign(element.style, styles);
};

const createButton = (label, styles) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    applyStyles(button, styles);
    return button;
};

const isEditableTarget = (target) => {
    if (!(target instanceof Element)) {
        return false;
    }

    if (target.closest('input, textarea, select, [contenteditable="true"]')) {
        return true;
    }

    const role = target.getAttribute('role');
    if (role === 'textbox' || role === 'searchbox') {
        return true;
    }

    if (target.closest('[role="textbox"], [role="searchbox"]')) {
        return true;
    }

    return false;
};

const parseRgbColor = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const match = value.match(/rgba?\(([^)]+)\)/i);
    if (!match) {
        return null;
    }

    const parts = match[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length < 3) {
        return null;
    }

    const r = Number.parseFloat(parts[0]);
    const g = Number.parseFloat(parts[1]);
    const b = Number.parseFloat(parts[2]);
    const a = parts.length > 3 ? Number.parseFloat(parts[3]) : 1;

    if ([r, g, b].some((component) => !Number.isFinite(component))) {
        return null;
    }

    return { r, g, b, a: Number.isFinite(a) ? a : 1 };
};

const parseHexColor = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const trimmed = value.trim().replace(/^#/, '');
    if (![3, 4, 6, 8].includes(trimmed.length)) {
        return null;
    }

    const expand = (component) => {
        if (component.length === 1) {
            return component.repeat(2);
        }
        return component;
    };

    const pairs =
        trimmed.length === 3 || trimmed.length === 4
            ? trimmed.split('').map((char) => expand(char))
            : trimmed.match(/.{2}/g);

    if (!pairs || (pairs.length !== 3 && pairs.length !== 4)) {
        return null;
    }

    const [r, g, b, a] = pairs.map((pair) => Number.parseInt(pair, 16));
    if ([r, g, b].some((component) => !Number.isFinite(component))) {
        return null;
    }

    return {
        r,
        g,
        b,
        a: Number.isFinite(a) ? a / 255 : 1
    };
};

const parseColorString = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    if (value.includes('var(')) {
        return null;
    }

    const trimmed = value.trim();
    if (!trimmed) {
        return null;
    }

    if (trimmed.startsWith('#')) {
        return parseHexColor(trimmed);
    }

    if (trimmed.startsWith('rgb')) {
        return parseRgbColor(trimmed);
    }

    return null;
};

const calculateLuminance = (color) => {
    if (!color) {
        return null;
    }

    const alpha = Number.isFinite(color.a) ? color.a : 1;
    if (alpha <= 0.05) {
        return null;
    }

    const r = color.r / 255;
    const g = color.g / 255;
    const b = color.b / 255;

    const transform = (channel) =>
        channel <= 0.03928 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);

    return 0.2126 * transform(r) + 0.7152 * transform(g) + 0.0722 * transform(b);
};

const resolveColorSchemeString = (value) => {
    if (!value || typeof value !== 'string') {
        return null;
    }

    const normalized = value.toLowerCase();
    const hasLight = normalized.includes('light');
    const hasDark = normalized.includes('dark');

    if (hasDark && !hasLight) {
        return 'dark';
    }
    if (hasLight && !hasDark) {
        return 'light';
    }

    if (hasDark && hasLight) {
        const first = normalized.trim().split(/\s+/)[0];
        if (first === 'dark' || first === 'light') {
            return first;
        }
    }

    return null;
};

const detectThemeMode = () => {
    const root = document.documentElement;
    const htmlAttr = root ? root.getAttribute('dark') : null;

    if (htmlAttr === '' || htmlAttr === 'true') {
        return 'dark';
    }
    if (htmlAttr === 'false') {
        return 'light';
    }
    if (root && root.hasAttribute('dark') && htmlAttr !== 'false') {
        return 'dark';
    }

    const inlineScheme = root && typeof root.style !== 'undefined' ? root.style.colorScheme : null;
    const resolvedInlineScheme = resolveColorSchemeString(inlineScheme);
    if (resolvedInlineScheme) {
        return resolvedInlineScheme;
    }

    const rootStyle = root ? window.getComputedStyle(root) : null;
    const computedScheme = rootStyle ? resolveColorSchemeString(rootStyle.colorScheme) : null;
    if (computedScheme) {
        return computedScheme;
    }

    const appElement = document.querySelector('ytd-app');
    if (appElement) {
        const appDarkAttr = appElement.getAttribute('dark') || appElement.getAttribute('dark-theme');
        const appLightAttr = appElement.getAttribute('light') || appElement.getAttribute('light-theme');
        if (appDarkAttr && appDarkAttr !== 'false') {
            return 'dark';
        }
        if (appLightAttr && appLightAttr !== 'false') {
            return 'light';
        }
        if (appDarkAttr === 'false') {
            return 'light';
        }
        if (
            appElement.classList.contains('dark') ||
            appElement.classList.contains('dark-theme') ||
            appElement.matches('[dark-theme]')
        ) {
            return 'dark';
        }
        if (
            appElement.classList.contains('light') ||
            appElement.classList.contains('light-theme') ||
            appElement.matches('[light-theme]')
        ) {
            return 'light';
        }

        const appScheme = resolveColorSchemeString(
            typeof appElement.style !== 'undefined' ? appElement.style.colorScheme : null
        );
        if (appScheme) {
            return appScheme;
        }
        const appComputedStyle = window.getComputedStyle(appElement);
        const appComputedScheme = resolveColorSchemeString(appComputedStyle.colorScheme);
        if (appComputedScheme) {
            return appComputedScheme;
        }
    }

    const luminanceCandidates = [root, appElement, document.querySelector('#content'), document.body];

    for (const candidate of luminanceCandidates) {
        if (!candidate) {
            continue;
        }

        const style = window.getComputedStyle(candidate);
        const colorStrings = [
            style.backgroundColor,
            style.getPropertyValue('--yt-spec-base-background'),
            style.getPropertyValue('--yt-spec-base-background-a'),
            style.getPropertyValue('--yt-spec-general-background-a'),
            style.getPropertyValue('--yt-spec-additive-background'),
            style.getPropertyValue('--yt-spec-raised-background')
        ];

        for (const colorString of colorStrings) {
            const parsed = parseColorString(colorString);
            const luminance = calculateLuminance(parsed);
            if (Number.isFinite(luminance)) {
                if (luminance >= 0.5) {
                    return 'light';
                }
                if (luminance <= 0.4) {
                    return 'dark';
                }
            }
        }
    }

    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        return 'dark';
    }

    return 'light';
};

const getThemePalette = () => {
    const detectedMode = detectThemeMode();
    if (detectedMode !== themeState.mode) {
        themeState.mode = detectedMode;
        themeState.palette = themePalettes[detectedMode] || themePalettes.dark;
    }
    return themeState.palette;
};

const applyThemeToUi = (palette) => {
    if (!palette) {
        return;
    }

    if (ui.heading) {
        ui.heading.style.color = palette.textPrimary;
    }
    if (ui.timestampLabel) {
        ui.timestampLabel.style.color = palette.textSecondary;
    }
    if (ui.container) {
        ui.container.style.color = palette.textPrimary;
    }
    if (ui.track) {
        ui.track.style.backgroundColor = palette.surfaceMuted;
        ui.track.style.border = palette.surfaceBorder;
    }
    if (ui.trackBaseline) {
        ui.trackBaseline.style.backgroundColor = palette.surfaceBaseline;
    }
    if (ui.emptyState) {
        ui.emptyState.style.color = palette.textSecondary;
    }
    if (ui.tooltip) {
        ui.tooltip.style.backgroundColor = palette.tooltipBackground;
        ui.tooltip.style.color = palette.tooltipText;
        ui.tooltip.style.boxShadow = palette.tooltipShadow;
    }
    if (ui.textarea) {
        ui.textarea.style.backgroundColor = palette.textareaBackground;
        ui.textarea.style.color = palette.textareaText;
        ui.textarea.style.border = palette.textareaBorder;
    }
    if (ui.deleteButton) {
        ui.deleteButton.style.color = palette.deleteText;
        ui.deleteButton.style.border = palette.deleteBorder;
    }
    if (ui.cancelButton) {
        ui.cancelButton.style.color = palette.cancelText;
    }
    if (ui.previewText) {
        ui.previewText.style.backgroundColor = palette.previewBackground;
        ui.previewText.style.color = palette.previewText;
        ui.previewText.style.border = palette.previewBorder;
        ui.previewText.style.boxShadow = palette.previewShadow;
    }
};

const createTooltip = (palette) => {
    const tooltip = document.createElement('div');
    tooltip.id = TOOLTIP_ID;
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'false');
    applyStyles(tooltip, {
        position: 'absolute',
        top: '0',
        left: '0',
        display: 'none',
        flexDirection: 'column',
        gap: '12px',
        width: '320px',
        padding: '16px',
        boxSizing: 'border-box',
        backgroundColor: palette.tooltipBackground,
        color: palette.tooltipText,
        borderRadius: '12px',
        boxShadow: palette.tooltipShadow,
        zIndex: '5000'
    });

    const heading = document.createElement('span');
    applyStyles(heading, {
        fontSize: '16px',
        fontWeight: '500'
    });

    const timestampLabel = document.createElement('span');
    applyStyles(timestampLabel, {
        fontSize: '12px',
        color: palette.textSecondary
    });

    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.placeholder = 'Capture your thoughts about this moment...';
    applyStyles(textarea, {
        width: '100%',
        maxHeight: '200px',
        resize: 'vertical',
        backgroundColor: palette.textareaBackground,
        color: palette.textareaText,
        border: palette.textareaBorder,
        borderRadius: '8px',
        padding: '12px',
        fontSize: '14px',
        boxSizing: 'border-box'
    });

    const actions = document.createElement('div');
    applyStyles(actions, {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '12px'
    });

    const leftGroup = document.createElement('div');
    applyStyles(leftGroup, {
        display: 'flex',
        gap: '8px'
    });

    const rightGroup = document.createElement('div');
    applyStyles(rightGroup, {
        display: 'flex',
        gap: '8px'
    });

    const deleteButton = createButton('Delete', {
        background: 'transparent',
        color: palette.deleteText,
        border: palette.deleteBorder,
        padding: '8px 12px',
        borderRadius: '999px',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'none'
    });

    const cancelButton = createButton('Cancel', {
        background: 'transparent',
        color: palette.cancelText,
        border: 'none',
        padding: '8px 12px',
        fontSize: '14px',
        cursor: 'pointer'
    });

    const saveButton = createButton('Save', {
        backgroundColor: '#3ea6ff',
        color: '#000000',
        border: 'none',
        padding: '8px 16px',
        fontSize: '14px',
        fontWeight: '600',
        borderRadius: '999px',
        cursor: 'pointer'
    });

    leftGroup.appendChild(deleteButton);
    rightGroup.appendChild(cancelButton);
    rightGroup.appendChild(saveButton);
    actions.appendChild(leftGroup);
    actions.appendChild(rightGroup);

    tooltip.appendChild(heading);
    tooltip.appendChild(timestampLabel);
    tooltip.appendChild(textarea);
    tooltip.appendChild(actions);

    return {
        tooltip,
        heading,
        timestampLabel,
        textarea,
        deleteButton,
        cancelButton,
        saveButton
    };
};

const createPreviewTooltip = (palette) => {
    const wrapper = document.createElement('div');
    wrapper.id = PREVIEW_TOOLTIP_ID;
    wrapper.setAttribute('aria-hidden', 'true');
    applyStyles(wrapper, {
        position: 'absolute',
        top: '0',
        left: '0',
        display: 'none',
        maxWidth: '240px',
        pointerEvents: 'none',
        zIndex: '4999'
    });

    const bubble = document.createElement('div');
    applyStyles(bubble, {
        backgroundColor: palette.previewBackground,
        color: palette.previewText,
        padding: '10px 12px',
        borderRadius: '10px',
        fontSize: '13px',
        lineHeight: '1.4',
        boxShadow: palette.previewShadow,
        border: palette.previewBorder,
        pointerEvents: 'none',
        whiteSpace: 'pre-line',
        wordBreak: 'break-word'
    });

    wrapper.appendChild(bubble);

    return { previewTooltip: wrapper, previewText: bubble };
};

const createContainer = (palette) => {
    const container = document.createElement('div');
    container.id = CONTAINER_ID;
    applyStyles(container, {
        position: 'relative',
        margin: '16px 0',
        padding: '8px 0 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px'
    });

    const header = document.createElement('div');
    applyStyles(header, {
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px'
    });

    const title = document.createElement('h2');
    title.textContent = 'Video Notes';
    applyStyles(title, {
        margin: '0',
        color: palette.textPrimary,
        fontSize: '20px',
        fontWeight: '600'
    });

    const addButton = createButton('+ Add note', {
        borderRadius: '999px',
        border: 'none',
        backgroundColor: '#3ea6ff',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600',
        lineHeight: '1.2',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 14px'
    });
    addButton.id = 'video-notes-add-button';
    addButton.setAttribute('aria-label', 'Add a note for the current moment');

    const zenButton = createButton('Zen Mode', {
        borderRadius: '999px',
        border: 'none',
        backgroundColor: '#3ea6ff',
        color: '#ffffff',
        fontSize: '14px',
        fontWeight: '600',
        lineHeight: '1.2',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '6px 14px',
        marginLeft: '8px',
        transition: 'background-color 0.2s ease'
    });
    zenButton.id = 'video-notes-zen-button';
    zenButton.setAttribute('aria-label', 'Toggle Zen Mode');

    zenButton.addEventListener('mouseenter', () => {
        zenButton.style.opacity = '0.9';
    });

    zenButton.addEventListener('mouseleave', () => {
        zenButton.style.opacity = '1';
    });

    const headerActions = document.createElement('div');
    applyStyles(headerActions, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    });
    headerActions.appendChild(zenButton);
    headerActions.appendChild(addButton);

    header.appendChild(title);
    header.appendChild(headerActions);

    const track = document.createElement('div');
    track.id = TRACK_ID;
    applyStyles(track, {
        position: 'relative',
        height: '36px',
        borderRadius: '18px',
        backgroundColor: palette.surfaceMuted,
        border: palette.surfaceBorder,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 12px'
    });

    const trackBaseline = document.createElement('div');
    applyStyles(trackBaseline, {
        position: 'absolute',
        top: '50%',
        left: '12px',
        right: '12px',
        height: '2px',
        backgroundColor: palette.surfaceBaseline,
        transform: 'translateY(-50%)'
    });

    track.appendChild(trackBaseline);

    const emptyState = document.createElement('span');
    emptyState.innerHTML = 'No notes yet. Click “+ Add note” to save your thoughts. <br>Use Alt + N (Windows) or Option + N (Mac) to create a new note, and Ctrl + Enter to save it.';
    applyStyles(emptyState, {
        color: palette.textSecondary,
        fontSize: '13px'
    });

    const {
        tooltip,
        heading,
        timestampLabel,
        textarea,
        deleteButton,
        cancelButton,
        saveButton
    } = createTooltip(palette);
    const { previewTooltip, previewText } = createPreviewTooltip(palette);

    container.appendChild(header);
    container.appendChild(track);
    container.appendChild(emptyState);
    container.appendChild(tooltip);
    container.appendChild(previewTooltip);

    return {
        container,
        addButton,
        track,
        trackBaseline,
        emptyState,
        tooltip,
        heading,
        timestampLabel,
        textarea,
        deleteButton,
        cancelButton,
        saveButton,
        previewTooltip,
        previewText,
        zenButton
    };
};

const getVideoElement = () => document.querySelector('video.html5-main-video');

const formatTimestamp = (value) => {
    if (!Number.isFinite(value) || value < 0) {
        return '00:00';
    }

    const totalSeconds = Math.floor(value);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const minutePart = minutes.toString().padStart(2, '0');
    const secondPart = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutePart}:${secondPart}`;
    }

    return `${minutePart}:${secondPart}`;
};

const getVideoIdFromLocation = () => {
    try {
        const url = new URL(window.location.href);
        const watchId = url.searchParams.get('v');
        if (watchId) {
            return watchId;
        }

        const shortsMatch = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]+)/);
        if (shortsMatch && shortsMatch[1]) {
            return shortsMatch[1];
        }
    } catch (error) {
        return null;
    }

    return null;
};

const getStorageArea = () => {
    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
    }
    return null;
};

const getStoredNotes = () => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve({});
    }

    return new Promise((resolve) => {
        storage.get([NOTES_STORAGE_KEY], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                resolve({});
                return;
            }
            resolve(result[NOTES_STORAGE_KEY] || {});
        });
    });
};

const saveStoredNotes = (payload) => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        storage.set({ [NOTES_STORAGE_KEY]: payload }, () => {
            resolve();
        });
    });
};

const getStoredMetadata = () => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve({});
    }

    return new Promise((resolve) => {
        storage.get([METADATA_STORAGE_KEY], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                resolve({});
                return;
            }
            resolve(result[METADATA_STORAGE_KEY] || {});
        });
    });
};

const saveStoredMetadata = (payload) => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        storage.set({ [METADATA_STORAGE_KEY]: payload }, () => {
            resolve();
        });
    });
};

const persistVideoMetadata = async (videoId, metadata) => {
    if (!videoId) {
        return;
    }

    const allMetadata = await getStoredMetadata();

    if (!metadata) {
        if (Object.prototype.hasOwnProperty.call(allMetadata, videoId)) {
            delete allMetadata[videoId];
            await saveStoredMetadata(allMetadata);
        }
        return;
    }

    const existing = allMetadata[videoId] || {};
    const merged = {
        ...existing,
        ...metadata
    };

    const keys = Object.keys(metadata);
    const hasChanges = keys.some((key) => existing[key] !== metadata[key]);
    if (!hasChanges) {
        return;
    }

    merged.updatedAt = Date.now();
    allMetadata[videoId] = merged;
    await saveStoredMetadata(allMetadata);
};

const getVideoTitleText = () => {
    const titleElement = document.querySelector('#primary-inner ytd-watch-metadata #title');
    if (titleElement && typeof titleElement.textContent === 'string') {
        const text = titleElement.textContent.trim();
        if (text) {
            return text;
        }
    }

    const documentTitle = typeof document !== 'undefined' && document.title ? document.title : '';
    const cleaned = documentTitle.replace(/\s+-\s+YouTube$/, '').trim();
    if (cleaned) {
        return cleaned;
    }

    return documentTitle.trim() || 'Untitled video';
};

const loadNotesForVideo = async (videoId) => {
    if (!videoId) {
        return [];
    }

    const allNotes = await getStoredNotes();
    const notes = Array.isArray(allNotes[videoId]) ? allNotes[videoId] : [];
    return notes
        .map((note) => ({
            ...note,
            timestamp: Number(note.timestamp)
        }))
        .sort((a, b) => a.timestamp - b.timestamp);
};

const persistNotesForVideo = async (videoId, notes) => {
    if (!videoId) {
        return;
    }

    const allNotes = await getStoredNotes();
    allNotes[videoId] = notes;
    await saveStoredNotes(allNotes);

    if (!Array.isArray(notes) || notes.length === 0) {
        await persistVideoMetadata(videoId, null);
        return;
    }

    await persistVideoMetadata(videoId, {
        title: getVideoTitleText(),
        noteCount: notes.length
    });
};

const generateNoteId = () => {
    const random = Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${random}`;
};

const closeTooltip = () => {
    if (!ui.tooltip) {
        return;
    }

    ui.tooltip.style.display = 'none';
    ui.tooltip.style.visibility = 'visible';
    if (ui.textarea) {
        ui.textarea.value = '';
    }
    state.tooltipMode = null;
    state.pendingTimestamp = null;
    state.activeNoteId = null;
    state.tooltipAnchor = null;
    hideNotePreview();
    const resumeVideo = state.resumePlaybackVideo;
    if (resumeVideo && typeof resumeVideo.play === 'function' && resumeVideo.isConnected !== false) {
        try {
            const playResult = resumeVideo.play();
            if (playResult && typeof playResult.catch === 'function') {
                playResult.catch(() => {});
            }
        } catch {
            // Ignore playback errors caused by browser policies or missing user gesture.
        }
    }
    state.resumePlaybackVideo = null;
    if (typeof tooltipDismissCleanup === 'function') {
        tooltipDismissCleanup();
        tooltipDismissCleanup = null;
    }
};

const resolveAnchor = (anchorCandidate, fallbackNoteId, allowButtonFallback = true) => {
    let reference = anchorCandidate instanceof Element ? anchorCandidate : null;
    if (reference && !reference.isConnected) {
        reference = null;
    }

    if (!reference && fallbackNoteId && ui.track) {
        const candidate = ui.track.querySelector(`[data-note-id="${fallbackNoteId}"]`);
        if (candidate) {
            reference = candidate;
        }
    }

    if (allowButtonFallback && !reference && ui.addButton && ui.addButton.isConnected) {
        reference = ui.addButton;
    }

    return reference;
};

const positionTooltip = (anchorCandidate) => {
    if (!ui.tooltip || !ui.container) {
        return;
    }

    const containerRect = ui.container.getBoundingClientRect();
    const containerCenterX = containerRect.left + containerRect.width / 2;
    const containerCenterY = containerRect.top + containerRect.height / 2;

    const reference = resolveAnchor(anchorCandidate, state.activeNoteId, true);
    state.tooltipAnchor = reference || null;

    const anchorRect = reference
        ? reference.getBoundingClientRect()
        : {
              top: containerCenterY,
              bottom: containerCenterY,
              left: containerCenterX,
              width: 0
          };

    const tooltipRect = ui.tooltip.getBoundingClientRect();

    const rawTop = anchorRect.top - containerRect.top - tooltipRect.height - TOOLTIP_OFFSET;
    const viewportSpaceAbove = anchorRect.top;
    const viewportSpaceBelow = window.innerHeight - anchorRect.bottom;
    let top = rawTop;
    if (
        !Number.isFinite(rawTop) ||
        (viewportSpaceAbove < tooltipRect.height + TOOLTIP_OFFSET && viewportSpaceBelow > viewportSpaceAbove)
    ) {
        top = anchorRect.bottom - containerRect.top + TOOLTIP_OFFSET;
    }

    const anchorCenterX = reference ? anchorRect.left + anchorRect.width / 2 : containerCenterX;

    let left = anchorCenterX - containerRect.left - tooltipRect.width / 2;
    if (!Number.isFinite(left)) {
        left = (containerRect.width - tooltipRect.width) / 2;
    }

    const maxLeft = Math.max(containerRect.width - tooltipRect.width, 0);
    left = Math.min(Math.max(left, 0), maxLeft);

    ui.tooltip.style.top = `${top}px`;
    ui.tooltip.style.left = `${left}px`;
    ui.tooltip.style.right = 'auto';
    ui.tooltip.style.bottom = 'auto';
};

const hideNotePreview = () => {
    if (!ui.previewTooltip) {
        return;
    }

    ui.previewTooltip.style.display = 'none';
    if (ui.previewText) {
        ui.previewText.textContent = '';
    }
    state.previewAnchor = null;
    state.previewNoteId = null;
};

const positionPreviewTooltip = () => {
    if (!ui.previewTooltip || !ui.container || ui.previewTooltip.style.display !== 'block') {
        return;
    }

    const containerRect = ui.container.getBoundingClientRect();

    const reference = resolveAnchor(state.previewAnchor, state.previewNoteId, false);
    if (!reference) {
        hideNotePreview();
        return;
    }

    state.previewAnchor = reference;

    const anchorRect = reference.getBoundingClientRect();
    const tooltipRect = ui.previewTooltip.getBoundingClientRect();

    const rawTop = anchorRect.top - containerRect.top - tooltipRect.height - PREVIEW_OFFSET;
    const viewportSpaceAbove = anchorRect.top;
    const viewportSpaceBelow = window.innerHeight - anchorRect.bottom;
    let top = rawTop;
    if (
        !Number.isFinite(rawTop) ||
        (viewportSpaceAbove < tooltipRect.height + PREVIEW_OFFSET && viewportSpaceBelow > viewportSpaceAbove)
    ) {
        top = anchorRect.bottom - containerRect.top + PREVIEW_OFFSET;
    }

    const anchorCenterX = anchorRect.left + anchorRect.width / 2;
    let left = anchorCenterX - containerRect.left - tooltipRect.width / 2;
    if (!Number.isFinite(left)) {
        left = (containerRect.width - tooltipRect.width) / 2;
    }

    const maxLeft = Math.max(containerRect.width - tooltipRect.width, 0);
    left = Math.min(Math.max(left, 0), maxLeft);

    ui.previewTooltip.style.top = `${top}px`;
    ui.previewTooltip.style.left = `${left}px`;
};

const showNotePreview = (note, anchor) => {
    if (!ui.previewTooltip || !ui.previewText || !note || !note.text) {
        hideNotePreview();
        return;
    }

    state.previewNoteId = note.id;
    state.previewAnchor = anchor instanceof Element ? anchor : null;
    ui.previewText.textContent = note.text;
    ui.previewTooltip.style.display = 'block';
    positionPreviewTooltip();
};

const repositionTooltip = () => {
    if (ui.tooltip && ui.tooltip.style.display === 'flex') {
        positionTooltip(state.tooltipAnchor);
    }

    positionPreviewTooltip();
};

const attachResponsiveListeners = () => {
    if (globalListenersAttached) {
        return;
    }

    globalListenersAttached = true;
    window.addEventListener('resize', repositionTooltip);
    window.addEventListener('orientationchange', repositionTooltip);
    window.addEventListener('scroll', repositionTooltip, true);
};

const attachShortcutListener = () => {
    if (shortcutListenerAttached) {
        return;
    }

    window.addEventListener('keydown', handleShortcutKeydown);
    shortcutListenerAttached = true;
};

const attachTooltipDismissListener = () => {
    if (tooltipDismissCleanup) {
        return;
    }

    const handlePointerDown = (event) => {
        if (!ui.tooltip || ui.tooltip.style.display !== 'flex') {
            return;
        }

        const target = event.target;
        if (target instanceof Node) {
            if (ui.tooltip.contains(target)) {
                return;
            }
            if (state.tooltipAnchor && state.tooltipAnchor.contains && state.tooltipAnchor.contains(target)) {
                return;
            }
        }

        closeTooltip();
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    tooltipDismissCleanup = () => {
        document.removeEventListener('pointerdown', handlePointerDown, true);
    };
};

const openTooltip = ({ mode, timestamp, note, anchor }) => {
    if (!ui.tooltip) {
        return;
    }

    state.tooltipMode = mode;
    state.pendingTimestamp = timestamp;
    state.activeNoteId = note ? note.id : null;
    let anchorElement = anchor instanceof Element ? anchor : null;
    if (anchorElement && !anchorElement.isConnected) {
        anchorElement = null;
    }

    if (!anchorElement && ui.addButton && ui.addButton.isConnected) {
        anchorElement = ui.addButton;
    }

    state.tooltipAnchor = anchorElement;

    if (ui.heading) {
        ui.heading.textContent = mode === 'edit' ? 'Edit note' : 'Add a note';
    }
    if (ui.timestampLabel) {
        ui.timestampLabel.textContent = `@ ${formatTimestamp(timestamp)}`;
    }
    if (ui.textarea) {
        ui.textarea.value = note ? note.text : '';
    }
    if (ui.deleteButton) {
        ui.deleteButton.style.display = mode === 'edit' ? 'inline-flex' : 'none';
    }

    hideNotePreview();
    ui.tooltip.style.display = 'flex';
    ui.tooltip.style.visibility = 'hidden';
    attachTooltipDismissListener();

    window.requestAnimationFrame(() => {
        if (!ui.tooltip || ui.tooltip.style.display !== 'flex') {
            return;
        }

        positionTooltip(state.tooltipAnchor);
        ui.tooltip.style.visibility = 'visible';

        if (ui.textarea) {
            const endPosition = ui.textarea.value.length;
            ui.textarea.focus();
            ui.textarea.setSelectionRange(endPosition, endPosition);
        }
    });
};

const renderNotesTrack = () => {
    if (!ui.track) {
        return;
    }

    const palette = getThemePalette();
    const existingDots = ui.track.querySelectorAll('[data-note-id]');
    existingDots.forEach((node) => node.remove());

    const hasNotes = state.notes.length > 0;
    if (ui.emptyState) {
        ui.emptyState.style.display = hasNotes ? 'none' : 'block';
    }

    if (!hasNotes) {
        hideNotePreview();
        return;
    }

    const video = state.video;
    const duration = video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;

    state.notes.forEach((note) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.dataset.noteId = note.id;
        const accessibleText = (note.text || '').replace(/\s+/g, ' ').trim();
        const ariaLabel = accessibleText
            ? `View note at ${formatTimestamp(note.timestamp)}: ${accessibleText}`
            : `View note at ${formatTimestamp(note.timestamp)}`;
        dot.setAttribute('aria-label', ariaLabel);
        applyStyles(dot, {
            position: 'absolute',
            top: '50%',
            width: '16px',
            height: '16px',
            borderRadius: '999px',
            border: palette.noteDotBorder,
            background:
                'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, #cde8ff 45%, #3ea6ff 100%)',
            transform: 'translate(-50%, -50%)',
            cursor: 'pointer',
            transition: 'transform 140ms ease, box-shadow 140ms ease',
            boxShadow: palette.noteDotShadow,
            outline: 'none'
        });

        const highlightDot = () => {
            dot.style.transform = 'translate(-50%, -50%) scale(1.25)';
            dot.style.boxShadow = palette.noteDotShadowActive;
            showNotePreview(note, dot);
        };

        const resetDot = () => {
            dot.style.transform = 'translate(-50%, -50%)';
            dot.style.boxShadow = palette.noteDotShadow;
            if (state.previewNoteId === note.id) {
                hideNotePreview();
            }
        };

        dot.addEventListener('mouseenter', highlightDot);
        dot.addEventListener('mouseleave', resetDot);
        dot.addEventListener('focus', highlightDot);
        dot.addEventListener('blur', resetDot);

        dot.addEventListener('click', (event) => {
            event.stopPropagation();
            handleNoteDotClick(note.id, dot);
        });

        let position = 0;
        if (duration && duration > 0) {
            position = Math.min(Math.max((note.timestamp / duration) * 100, 0), 100);
        }

        dot.style.left = `${position}%`;
        ui.track.appendChild(dot);
    });

    repositionTooltip();
};

const handleThemeChange = () => {
    const palette = getThemePalette();
    applyThemeToUi(palette);
    if (ui.track) {
        renderNotesTrack();
    }
};

const watchThemeChanges = () => {
    if (themeObserver) {
        return;
    }

    const scheduleUpdate = () => {
        window.requestAnimationFrame(handleThemeChange);
    };

    themeObserver = new MutationObserver(scheduleUpdate);

    const root = document.documentElement;
    if (root) {
        themeObserver.observe(root, {
            attributes: true,
            attributeFilter: ['dark', 'class', 'style']
        });
    }

    const observeYtdApp = () => {
        const appElement = document.querySelector('ytd-app');
        if (!appElement) {
            return false;
        }

        themeObserver.observe(appElement, {
            attributes: true,
            attributeFilter: ['dark', 'class', 'style']
        });
        return true;
    };

    if (!observeYtdApp()) {
        themeAppObserver = new MutationObserver(() => {
            if (observeYtdApp() && themeAppObserver) {
                themeAppObserver.disconnect();
                themeAppObserver = null;
            }
        });

        if (root) {
            themeAppObserver.observe(root, { childList: true, subtree: true });
        }
    }

    if (window.matchMedia) {
        themeMediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const mediaListener = () => scheduleUpdate();
        if (themeMediaQuery.addEventListener) {
            themeMediaQuery.addEventListener('change', mediaListener);
        } else if (themeMediaQuery.addListener) {
            themeMediaQuery.addListener(mediaListener);
        }
    }
};

const handleNoteDotClick = (noteId, anchor) => {
    const note = state.notes.find((entry) => entry.id === noteId);
    if (!note) {
        return;
    }

    if (state.video) {
        state.video.currentTime = note.timestamp;
    }

    hideNotePreview();
    openTooltip({ mode: 'edit', timestamp: note.timestamp, note, anchor });
};

const handleAddButtonClick = () => {
    const video = state.video || getVideoElement();
    if (!video) {
        return;
    }

    state.video = video;
    const wasPlaying = !video.paused && !video.ended;
    state.resumePlaybackVideo = wasPlaying ? video : null;
    video.pause();

    const timestamp = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    hideNotePreview();
    openTooltip({ mode: 'create', timestamp, note: null, anchor: ui.addButton });
};

const toggleZenMode = (enabled) => {
    state.zenMode = enabled;

    const root = document.documentElement;
    if (enabled) {
        root.classList.add('video-notes-zen');
        if (ui.zenButton) {
            ui.zenButton.textContent = 'Exit Zen';
            ui.zenButton.style.backgroundColor = '#606060'; // Darker gray for exit state
        }
    } else {
        root.classList.remove('video-notes-zen');
        if (ui.zenButton) {
            ui.zenButton.textContent = 'Zen Mode';
            ui.zenButton.style.backgroundColor = '#3ea6ff';
        }
    }

    // Inject styles if not already present
    if (!document.getElementById('video-notes-zen-styles')) {
        const style = document.createElement('style');
        style.id = 'video-notes-zen-styles';
        style.textContent = `
            html.video-notes-zen #secondary,
            html.video-notes-zen #comments,
            html.video-notes-zen ytd-merch-shelf-renderer,
            html.video-notes-zen #related,
            html.video-notes-zen #bottom-row {
                display: none !important;
            }
            
            html.video-notes-zen ytd-watch-flexy[flexy] #primary.ytd-watch-flexy {
                max-width: 100% !important;
                min-width: 0 !important;
                margin-left: auto !important;
                margin-right: auto !important;
                padding: 0 24px !important;
            }
            
            html.video-notes-zen #columns {
                max-width: 1200px !important;
                margin: 0 auto !important;
            }
        `;
        document.head.appendChild(style);
    }
};

const handleZenButtonClick = () => {
    const newState = !state.zenMode;
    toggleZenMode(newState);

    const storage = getStorageArea();
    if (storage) {
        storage.set({ [ZEN_MODE_STORAGE_KEY]: newState });
    }
};

const handleShortcutKeydown = (event) => {
    if (event.defaultPrevented) {
        return;
    }

    if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
    }

    const code = typeof event.code === 'string' ? event.code : '';
    const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
    if (code !== 'KeyN' && key !== 'n') {
        return;
    }

    if (event.repeat) {
        event.preventDefault();
        return;
    }

    if (isEditableTarget(event.target)) {
        return;
    }

    if (!ui.addButton || !ui.addButton.isConnected) {
        if (!ensureUiReady()) {
            return;
        }
    }

    if (!ui.addButton || !ui.addButton.isConnected) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    handleAddButtonClick();
};

const handleSave = async () => {
    if (!state.videoId || !state.tooltipMode || !ui.textarea) {
        closeTooltip();
        return;
    }

    const text = ui.textarea.value.trim();
    if (!text) {
        ui.textarea.focus();
        return;
    }

    const timestamp = state.pendingTimestamp ?? 0;
    const notes = [...state.notes];

    if (state.tooltipMode === 'create') {
        notes.push({
            id: generateNoteId(),
            timestamp,
            text,
            createdAt: Date.now(),
            updatedAt: Date.now()
        });
    } else if (state.tooltipMode === 'edit' && state.activeNoteId) {
        const index = notes.findIndex((note) => note.id === state.activeNoteId);
        if (index >= 0) {
            notes[index] = {
                ...notes[index],
                text,
                updatedAt: Date.now()
            };
        }
    }

    notes.sort((a, b) => a.timestamp - b.timestamp);
    state.notes = notes;

    await persistNotesForVideo(state.videoId, notes);
    renderNotesTrack();
    closeTooltip();
};

const handleDelete = async () => {
    if (!state.videoId || !state.activeNoteId) {
        return;
    }

    const filtered = state.notes.filter((note) => note.id !== state.activeNoteId);
    state.notes = filtered;
    await persistNotesForVideo(state.videoId, filtered);
    renderNotesTrack();
    closeTooltip();
};

const handleTooltipKeydown = (event) => {
    if (event.key === 'Escape') {
        closeTooltip();
        return;
    }

    const isTextareaShortcutTarget = ui.textarea && event.target === ui.textarea;
    const isSaveShortcut = event.key === 'Enter' && (event.ctrlKey || event.metaKey);
    if (isTextareaShortcutTarget && isSaveShortcut) {
        event.preventDefault();
        handleSave();
    }
};

const attachUiListeners = () => {
    if (!ui.addButton || !ui.tooltip) {
        return;
    }

    ui.addButton.addEventListener('click', handleAddButtonClick);
    if (ui.zenButton) {
        ui.zenButton.addEventListener('click', handleZenButtonClick);
    }
    ui.cancelButton.addEventListener('click', closeTooltip);
    ui.saveButton.addEventListener('click', handleSave);
    ui.deleteButton.addEventListener('click', handleDelete);
    ui.tooltip.addEventListener('keydown', handleTooltipKeydown);
};

const detachVideoListeners = () => {
    if (!state.video) {
        return;
    }

    VIDEO_EVENTS.forEach((eventName) => {
        state.video.removeEventListener(eventName, handleVideoMetadata);
    });
};

const handleVideoMetadata = () => {
    renderNotesTrack();
};

const assignVideoElement = () => {
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

const refreshNotesForCurrentVideo = async () => {
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

    if (state.videoId === videoId) {
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

const locateTitleContainer = () => document.querySelector('#primary-inner ytd-watch-metadata #title');

const insertContainer = () => {
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

    metadataContainer.insertBefore(elements.container, titleContainer);
    applyThemeToUi(palette);
    attachUiListeners();
    return true;
};

const ensureUiReady = (videoIdOverride) => {
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

const observer = new MutationObserver(() => {
    if (ensureUiReady()) {
        observer.disconnect();
    }
});

const startObserving = () => {
    if (!document.body) {
        return;
    }

    observer.disconnect();
    observer.observe(document.body, OBSERVER_OPTIONS);
};

const handleRouteChange = () => {
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

const initialize = () => {
    attachResponsiveListeners();
    attachShortcutListener();
    watchThemeChanges();
    handleThemeChange();
    handleRouteChange();

    const storage = getStorageArea();
    if (storage) {
        storage.get([ZEN_MODE_STORAGE_KEY], (result) => {
            if (result[ZEN_MODE_STORAGE_KEY]) {
                toggleZenMode(true);
            }
        });

        if (chrome.storage.onChanged) {
            chrome.storage.onChanged.addListener((changes, areaName) => {
                if (areaName === 'local' && changes[ZEN_MODE_STORAGE_KEY]) {
                    toggleZenMode(changes[ZEN_MODE_STORAGE_KEY].newValue);
                }
            });
        }
    }
};

initialize();

['yt-navigate-finish', 'yt-page-data-updated'].forEach((eventName) => {
    window.addEventListener(eventName, handleRouteChange);
});
