const CONTAINER_ID = 'video-notes-container';
const TRACK_ID = 'video-notes-track';
const TOOLTIP_ID = 'video-notes-tooltip';
const PREVIEW_TOOLTIP_ID = 'video-notes-preview';
const NOTES_STORAGE_KEY = 'videoNotes:notes';
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
    previewNoteId: null
};

const ui = {
    container: null,
    addButton: null,
    track: null,
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

let globalListenersAttached = false;

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

const createTooltip = () => {
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
        backgroundColor: '#202124',
        color: '#ffffff',
        borderRadius: '12px',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
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
        color: '#aaaaaa'
    });

    const textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.placeholder = 'Capture your thoughts about this moment...';
    applyStyles(textarea, {
        width: '100%',
        maxHeight: '200px',
        resize: 'vertical',
        backgroundColor: '#121212',
        color: '#ffffff',
        border: '1px solid #3f3f3f',
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
        color: '#ff7b7b',
        border: '1px solid rgba(255, 123, 123, 0.6)',
        padding: '8px 12px',
        borderRadius: '999px',
        fontSize: '13px',
        cursor: 'pointer',
        display: 'none'
    });

    const cancelButton = createButton('Cancel', {
        background: 'transparent',
        color: '#aaaaaa',
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

const createPreviewTooltip = () => {
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
        backgroundColor: 'rgba(32, 33, 36, 0.95)',
        color: '#ffffff',
        padding: '10px 12px',
        borderRadius: '10px',
        fontSize: '13px',
        lineHeight: '1.4',
        boxShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        pointerEvents: 'none',
        whiteSpace: 'pre-line',
        wordBreak: 'break-word'
    });

    wrapper.appendChild(bubble);

    return { previewTooltip: wrapper, previewText: bubble };
};

const createContainer = () => {
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
        color: '#f1f1f1',
        fontSize: '20px',
        fontWeight: '600'
    });

    const addButton = createButton('+', {
        width: '28px',
        height: '28px',
        borderRadius: '50%',
        border: 'none',
        backgroundColor: '#3ea6ff',
        color: '#000000',
        fontSize: '20px',
        fontWeight: '600',
        lineHeight: '1',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0'
    });
    addButton.id = 'video-notes-add-button';
    addButton.setAttribute('aria-label', 'Add a note for the current moment');

    header.appendChild(title);
    header.appendChild(addButton);

    const track = document.createElement('div');
    track.id = TRACK_ID;
    applyStyles(track, {
        position: 'relative',
        height: '36px',
        borderRadius: '18px',
        backgroundColor: 'rgba(255, 255, 255, 0.06)',
        border: '1px solid rgba(255, 255, 255, 0.08)',
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
        backgroundColor: 'rgba(255, 255, 255, 0.2)',
        transform: 'translateY(-50%)'
    });

    track.appendChild(trackBaseline);

    const emptyState = document.createElement('span');
    emptyState.textContent = 'No notes yet. Click + to capture a thought.';
    applyStyles(emptyState, {
        color: '#aaaaaa',
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
    } = createTooltip();
    const { previewTooltip, previewText } = createPreviewTooltip();

    container.appendChild(header);
    container.appendChild(track);
    container.appendChild(emptyState);
    container.appendChild(tooltip);
    container.appendChild(previewTooltip);

    return {
        container,
        addButton,
        track,
        emptyState,
        tooltip,
        heading,
        timestampLabel,
        textarea,
        deleteButton,
        cancelButton,
        saveButton,
        previewTooltip,
        previewText
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
            border: '1px solid rgba(10, 28, 46, 0.6)',
            background:
                'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, #cde8ff 45%, #3ea6ff 100%)',
            transform: 'translate(-50%, -50%)',
            cursor: 'pointer',
            transition: 'transform 140ms ease, box-shadow 140ms ease',
            boxShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
            outline: 'none'
        });

        const highlightDot = () => {
            dot.style.transform = 'translate(-50%, -50%) scale(1.25)';
            dot.style.boxShadow = '0 6px 14px rgba(62, 166, 255, 0.5)';
            showNotePreview(note, dot);
        };

        const resetDot = () => {
            dot.style.transform = 'translate(-50%, -50%)';
            dot.style.boxShadow = '0 3px 8px rgba(0, 0, 0, 0.25)';
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

    const timestamp = Number.isFinite(video.currentTime) ? video.currentTime : 0;
    hideNotePreview();
    openTooltip({ mode: 'create', timestamp, note: null, anchor: ui.addButton });
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
    }
};

const attachUiListeners = () => {
    if (!ui.addButton || !ui.tooltip) {
        return;
    }

    ui.addButton.addEventListener('click', handleAddButtonClick);
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

    const elements = createContainer();
    ui.container = elements.container;
    ui.addButton = elements.addButton;
    ui.track = elements.track;
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
    attachUiListeners();
    return true;
};

const ensureUiReady = () => {
    const inserted = insertContainer();
    if (inserted) {
        assignVideoElement();
        refreshNotesForCurrentVideo().catch(() => {});
    }
    return inserted;
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

const initialize = () => {
    attachResponsiveListeners();
    if (!ensureUiReady()) {
        startObserving();
    }
};

initialize();

['yt-navigate-finish', 'yt-page-data-updated'].forEach((eventName) => {
    window.addEventListener(eventName, () => {
        if (!ensureUiReady()) {
            startObserving();
        }
    });
});
