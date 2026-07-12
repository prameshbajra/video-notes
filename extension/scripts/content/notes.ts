import { getThemePalette } from './theme.js';
import { state, ui } from './state.js';
import {
    closeTooltip,
    hideNotePreview,
    hideTrackHoverTooltip,
    openTooltip,
    repositionTooltip,
    showTooltipError,
    showNotePreview,
    syncTooltipAnnotationControls,
    updateTrackHoverTooltip
} from './tooltip.js';
import { formatTimestamp, getVideoElement, isEditableTarget } from './utils.js';
import { persistNotesForVideo } from './storage.js';
import {
    configureAnnotationEditor,
    getPendingAnnotation,
    isAnnotationEditorActive,
    openAnnotationEditor,
    showAnnotationError
} from './annotations.js';

let shortcutListenerAttached = false;
let annotationCallbacksConfigured = false;
let ensureUiReadyRef: ((videoIdOverride?: string) => boolean) | null = null;
let isPersistingCapture = false;

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
        const hasAnnotation = Boolean(note.annotation);
        let ariaLabel = accessibleText
            ? `View note at ${formatTimestamp(note.timestamp)}: ${accessibleText}`
            : `View note at ${formatTimestamp(note.timestamp)}`;
        if (hasAnnotation) {
            ariaLabel += ' (includes drawing)';
        }
        dot.setAttribute('aria-label', ariaLabel);
        dot.style.position = 'absolute';
        dot.style.top = '50%';
        dot.style.width = '16px';
        dot.style.height = '16px';
        dot.style.borderRadius = '999px';
        dot.style.border = palette.noteDotBorder;
        dot.style.background = `radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.95) 0%, ${palette.noteDotHighlight} 45%, ${palette.noteDotCore} 100%)`;
        dot.style.transform = 'translate(-50%, -50%)';
        dot.style.cursor = 'pointer';
        dot.style.transition = 'transform 140ms ease, box-shadow 140ms ease';
        // An extra accent ring marks notes that carry a drawing.
        const annotationRing = hasAnnotation ? `, 0 0 0 2px ${palette.accent}` : '';
        dot.style.boxShadow = `${palette.noteDotShadow}${annotationRing}`;
        dot.style.outline = 'none';

        const highlightDot = (): void => {
            dot.style.transform = 'translate(-50%, -50%) scale(1.25)';
            dot.style.boxShadow = `${palette.noteDotShadowActive}${annotationRing}`;
            showNotePreview(note, dot);
        };

        const resetDot = (): void => {
            dot.style.transform = 'translate(-50%, -50%)';
            dot.style.boxShadow = `${palette.noteDotShadow}${annotationRing}`;
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
        dot.addEventListener('keydown', (event) => {
            if (event.key !== 'Enter' && event.key !== ' ') {
                return;
            }
            event.preventDefault();
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

    hideNotePreview();
    if (isAnnotationEditorActive()) {
        if (state.activeNoteId === note.id) {
            return;
        }
        closeTooltip({ resumePlayback: false });
    }

    if (note.annotation) {
        startAnnotationCapture({ note, timestamp: note.timestamp, anchor });
        return;
    }

    if (state.video) {
        state.video.currentTime = note.timestamp;
    }
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

    const video = state.video || getVideoElement();
    if (!video) {
        return;
    }

    const hoveredTimestamp = updateTrackHoverTooltip(event.clientX);
    const timestamp = hoveredTimestamp ?? (Number.isFinite(video.currentTime) ? video.currentTime : 0);

    if (isAnnotationEditorActive()) {
        closeTooltip({ resumePlayback: false });
    }

    if (!state.video) {
        state.video = video;
    }

    const wasPlaying = !video.paused && !video.ended;
    if (wasPlaying) {
        state.resumePlaybackVideo = video;
    }
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

const startAnnotationCapture = ({
    note,
    timestamp,
    anchor
}: {
    note: Note | null;
    timestamp: number;
    anchor: HTMLElement | null;
}): void => {
    if (isAnnotationEditorActive() || (!state.isAnnotationsEnabled && !note?.annotation)) {
        return;
    }

    const video = state.video || getVideoElement();
    if (!video) {
        return;
    }

    state.video = video;
    if (!video.paused && !video.ended && !state.resumePlaybackVideo) {
        state.resumePlaybackVideo = video;
    }
    video.pause();
    video.currentTime = timestamp;

    state.tooltipMode = note ? 'edit' : 'create';
    state.captureKind = 'annotation';
    state.pendingTimestamp = timestamp;
    state.activeNoteId = note?.id || null;
    state.tooltipAnchor = anchor;
    if (ui.textarea) {
        ui.textarea.value = '';
    }
    if (ui.tooltip) {
        ui.tooltip.style.display = 'none';
    }
    hideNotePreview();

    openAnnotationEditor(note?.annotation || null).then((opened) => {
        if (!opened) {
            closeTooltip();
        }
    }).catch(() => closeTooltip());
};

const handleAnnotateButtonClick = (): void => {
    if (!state.isEnabled || !state.isAnnotationsEnabled || isAnnotationEditorActive()) {
        return;
    }

    const video = state.video || getVideoElement();
    if (!video) {
        return;
    }

    startAnnotationCapture({
        note: null,
        timestamp: Number.isFinite(video.currentTime) ? video.currentTime : 0,
        anchor: ui.annotateButton
    });
};

const handleAnnotationActionClick = (): void => {
    if (isAnnotationEditorActive() || !state.isAnnotationsEnabled || state.tooltipMode !== 'create') {
        return;
    }

    const video = state.video || getVideoElement();
    if (!video) {
        return;
    }
    const timestamp = state.pendingTimestamp ?? (Number.isFinite(video.currentTime) ? video.currentTime : 0);
    closeTooltip({ resumePlayback: false });
    startAnnotationCapture({ note: null, timestamp, anchor: ui.annotateButton });
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
    const isNoteShortcut = code === 'KeyN' || key === 'n';
    const isAnnotationShortcut = code === 'KeyA' || key === 'a';
    if (!isNoteShortcut && !isAnnotationShortcut) {
        return;
    }

    if (event.repeat) {
        event.preventDefault();
        return;
    }

    if (isEditableTarget(event.target)) {
        return;
    }

    // Reopening the dialog mid-sketch would silently discard the drawing.
    if (isAnnotationEditorActive()) {
        return;
    }

    if (!ui.addButton || !ui.addButton.isConnected || !ui.annotateButton || !ui.annotateButton.isConnected) {
        if (!ensureUiReadyRef || !ensureUiReadyRef()) {
            return;
        }
    }

    if (!ui.addButton || !ui.addButton.isConnected || !ui.annotateButton || !ui.annotateButton.isConnected) {
        return;
    }

    if (isAnnotationShortcut && !state.isAnnotationsEnabled) {
        return;
    }

    event.preventDefault();
    event.stopPropagation();
    if (isAnnotationShortcut) {
        handleAnnotateButtonClick();
    } else {
        handleAddButtonClick();
    }
};

const attachShortcutListener = (): void => {
    if (!annotationCallbacksConfigured) {
        configureAnnotationEditor({
            onDone: () => {
                handleSave().catch(() => {});
            },
            onCancel: closeTooltip,
            onDelete: () => {
                handleDelete().catch(() => {});
            }
        });
        annotationCallbacksConfigured = true;
    }

    if (shortcutListenerAttached) {
        return;
    }

    window.addEventListener('keydown', handleShortcutKeydown);
    shortcutListenerAttached = true;
};

const handleSave = async (): Promise<void> => {
    if (isPersistingCapture) {
        return;
    }
    if (!state.videoId || !state.tooltipMode) {
        closeTooltip();
        return;
    }

    const text = state.captureKind === 'annotation' ? '' : (ui.textarea?.value || '').trim();
    let annotationUpdate: NoteAnnotation | null | undefined;
    try {
        annotationUpdate = getPendingAnnotation();
    } catch {
        showAnnotationError('Unable to prepare this drawing for saving. Please try again.');
        return;
    }

    if (state.captureKind === 'annotation' && annotationUpdate === null) {
        closeTooltip();
        return;
    }

    const timestamp = state.pendingTimestamp ?? 0;
    const notes = [...state.notes];

    if (state.tooltipMode === 'create') {
        const newNote: Note = {
            id: generateNoteId(),
            timestamp,
            text,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        if (annotationUpdate) {
            newNote.annotation = annotationUpdate;
        }

        notes.push(newNote);
    } else if (state.tooltipMode === 'edit' && state.activeNoteId) {
        const index = notes.findIndex((note) => note.id === state.activeNoteId);
        if (index >= 0) {
            const existingNote = notes[index];
            if (!existingNote) {
                closeTooltip();
                return;
            }
            const updatedNote: Note = {
                ...existingNote,
                text: state.captureKind === 'annotation' ? existingNote.text : text,
                updatedAt: Date.now()
            };

            if (annotationUpdate !== undefined) {
                if (annotationUpdate) {
                    updatedNote.annotation = annotationUpdate;
                } else {
                    delete updatedNote.annotation;
                }
            }

            notes[index] = updatedNote;
        }
    }

    const savedNote = state.tooltipMode === 'create'
        ? notes[notes.length - 1]
        : notes.find((note) => note.id === state.activeNoteId);
    if (!savedNote || (!savedNote.text && !savedNote.annotation)) {
        const message = state.captureKind === 'annotation'
            ? 'Draw something before saving the annotation.'
            : 'Add text or a drawing before saving this note.';
        if (isAnnotationEditorActive()) {
            showAnnotationError(message);
        } else {
            showTooltipError(message);
            ui.textarea?.focus();
        }
        return;
    }

    notes.sort((a, b) => a.timestamp - b.timestamp);
    isPersistingCapture = true;
    if (ui.saveButton) {
        ui.saveButton.disabled = true;
    }
    try {
        await persistNotesForVideo(state.videoId, notes);
        state.notes = notes;
        renderNotesTrack();
        closeTooltip();
    } catch {
        if (isAnnotationEditorActive()) {
            showAnnotationError('Unable to save. Your drawing is still open; please try again.');
        } else {
            showTooltipError('Unable to save this note. Your changes are still here; please try again.');
        }
    } finally {
        isPersistingCapture = false;
        if (ui.saveButton) {
            ui.saveButton.disabled = false;
        }
    }
};

const handleDelete = async (): Promise<void> => {
    if (!state.videoId || !state.activeNoteId) {
        return;
    }

    const filtered = state.notes.filter((note) => note.id !== state.activeNoteId);
    try {
        await persistNotesForVideo(state.videoId, filtered);
        state.notes = filtered;
        renderNotesTrack();
        closeTooltip();
    } catch {
        if (isAnnotationEditorActive()) {
            showAnnotationError('Unable to delete this annotation. Please try again.');
        } else {
            showTooltipError('Unable to delete this note. Please try again.');
        }
    }
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
    handleAnnotateButtonClick,
    handleAnnotationActionClick,
    handleDelete,
    handleTrackClick,
    handleTrackMouseLeave,
    handleTrackMouseMove,
    handleTooltipKeydown,
    handleSave,
    renderNotesTrack,
    syncTooltipAnnotationControls,
    setEnsureUiReady
};
