import { getThemePalette } from './theme.js';
import { state, ui } from './state.js';
import {
    closeTooltip,
    hideNotePreview,
    hideTrackHoverTooltip,
    openTooltip,
    repositionTooltip,
    showNotePreview,
    updateTrackHoverTooltip
} from './tooltip.js';
import { formatTimestamp, getVideoElement, isEditableTarget } from './utils.js';
import { persistNotesForVideo } from './storage.js';

let shortcutListenerAttached = false;
let ensureUiReadyRef: ((videoIdOverride?: string) => boolean) | null = null;

const setEnsureUiReady = (callback: (videoIdOverride?: string) => boolean): void => {
    ensureUiReadyRef = callback;
};

const generateNoteId = (): string => {
    const random = Math.random().toString(36).slice(2, 10);
    return `${Date.now().toString(36)}-${random}`;
};

const renderNotesTrack = (): void => {
    if (!state.isEnabled) {
        return;
    }

    if (!ui.track) {
        return;
    }

    const track = ui.track;
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
        dot.style.position = 'absolute';
        dot.style.top = '50%';
        dot.style.width = '16px';
        dot.style.height = '16px';
        dot.style.borderRadius = '999px';
        dot.style.border = palette.noteDotBorder;
        dot.style.background =
            'radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, #cde8ff 45%, #3ea6ff 100%)';
        dot.style.transform = 'translate(-50%, -50%)';
        dot.style.cursor = 'pointer';
        dot.style.transition = 'transform 140ms ease, box-shadow 140ms ease';
        dot.style.boxShadow = palette.noteDotShadow;
        dot.style.outline = 'none';

        const highlightDot = (): void => {
            dot.style.transform = 'translate(-50%, -50%) scale(1.25)';
            dot.style.boxShadow = palette.noteDotShadowActive;
            showNotePreview(note, dot);
        };

        const resetDot = (): void => {
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
        track.appendChild(dot);
    });

    repositionTooltip();
};

const handleNoteDotClick = (noteId: string, anchor: HTMLElement): void => {
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

const handleTrackMouseMove = (event: MouseEvent): void => {
    if (!state.isEnabled) {
        return;
    }

    if (event.target instanceof Element && event.target.closest('[data-note-id]')) {
        hideTrackHoverTooltip();
        return;
    }

    updateTrackHoverTooltip(event.clientX);
};

const handleTrackMouseLeave = (): void => {
    hideTrackHoverTooltip();
};

const handleTrackClick = (event: MouseEvent): void => {
    if (!state.isEnabled) {
        return;
    }

    const timestamp = updateTrackHoverTooltip(event.clientX);
    if (timestamp === null) {
        return;
    }

    const video = state.video || getVideoElement();
    if (!video) {
        return;
    }
    if (!state.video) {
        state.video = video;
    }

    const wasPlaying = !video.paused && !video.ended;
    state.resumePlaybackVideo = wasPlaying ? video : null;
    video.pause();

    const anchor = ui.trackHoverTooltip && ui.trackHoverTooltip.isConnected ? ui.trackHoverTooltip : ui.track;
    openTooltip({ mode: 'create', timestamp, note: null, anchor: anchor || undefined });
};

const handleAddButtonClick = (): void => {
    if (!state.isEnabled) {
        return;
    }

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

const handleShortcutKeydown = (event: KeyboardEvent): void => {
    if (!state.isEnabled) {
        return;
    }

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
        if (!ensureUiReadyRef || !ensureUiReadyRef()) {
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

const attachShortcutListener = (): void => {
    if (shortcutListenerAttached) {
        return;
    }

    window.addEventListener('keydown', handleShortcutKeydown);
    shortcutListenerAttached = true;
};

const handleSave = async (): Promise<void> => {
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
            const existingNote = notes[index];
            if (!existingNote) {
                closeTooltip();
                return;
            }
            notes[index] = {
                ...existingNote,
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

const handleDelete = async (): Promise<void> => {
    if (!state.videoId || !state.activeNoteId) {
        return;
    }

    const filtered = state.notes.filter((note) => note.id !== state.activeNoteId);
    state.notes = filtered;
    await persistNotesForVideo(state.videoId, filtered);
    renderNotesTrack();
    closeTooltip();
};

const handleTooltipKeydown = (event: KeyboardEvent): void => {
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

export {
    attachShortcutListener,
    handleAddButtonClick,
    handleDelete,
    handleTrackClick,
    handleTrackMouseLeave,
    handleTrackMouseMove,
    handleTooltipKeydown,
    handleSave,
    renderNotesTrack,
    setEnsureUiReady
};
