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
const persistingCaptureSessions = new Set<number>();
let persistenceQueue: Promise<void> = Promise.resolve();
const ANNOTATION_SEEK_TOLERANCE_SECONDS = 0.1;
const USER_PLAYBACK_INTENT_WINDOW_MS = 1_500;

const persistNotesInOrder = (videoId: string, notes: Note[]): Promise<void> => {
    const operation = persistenceQueue.then(() => persistNotesForVideo(videoId, notes));
    persistenceQueue = operation.catch(() => {});
    return operation;
};

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
}): boolean => {
    if (isAnnotationEditorActive() || (!state.isAnnotationsEnabled && !note?.annotation)) {
        return false;
    }

    const video = state.video || getVideoElement();
    if (!video) {
        return false;
    }
    const annotationVideo = video;

    state.video = annotationVideo;
    if (!annotationVideo.paused && !annotationVideo.ended && !state.resumePlaybackVideo) {
        state.resumePlaybackVideo = annotationVideo;
    }

    state.captureSessionId += 1;
    const captureSessionId = state.captureSessionId;
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

    let pauseGuardActive = true;
    let userPlaybackIntentExpiresAt = 0;
    let editorRootObserver: MutationObserver | null = null;
    function releasePauseGuard(): void {
        if (!pauseGuardActive) {
            return;
        }
        pauseGuardActive = false;
        document.removeEventListener('play', enforceAnnotationPause, true);
        document.removeEventListener('playing', enforceAnnotationPause, true);
        window.removeEventListener('keydown', handlePlaybackIntentKeydown, true);
        document.removeEventListener('pointerdown', handlePlaybackIntentPointerdown, true);
        if (editorRootObserver) {
            editorRootObserver.disconnect();
            editorRootObserver = null;
        }
    }
    function markUserPlaybackIntent(): void {
        userPlaybackIntentExpiresAt = Date.now() + USER_PLAYBACK_INTENT_WINDOW_MS;
    }
    function handlePlaybackIntentKeydown(event: KeyboardEvent): void {
        if (!event.isTrusted || event.repeat || isEditableTarget(event.target)) {
            return;
        }

        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('button, [role="button"]')) {
            return;
        }

        const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
        if (key === ' ' || key === 'k' || key === 'mediaplay' || key === 'mediaplaypause') {
            markUserPlaybackIntent();
        }
    }
    function handlePlaybackIntentPointerdown(event: PointerEvent): void {
        if (!event.isTrusted || !(event.target instanceof Element)) {
            return;
        }

        if (event.target.closest(
            'video, .ytp-play-button, .ytp-large-play-button, .ytp-cued-thumbnail-overlay'
        )) {
            markUserPlaybackIntent();
        }
    }
    function seekAndPauseAtAnnotation(playbackVideo: HTMLVideoElement = annotationVideo): void {
        if (!pauseGuardActive || state.captureSessionId !== captureSessionId) {
            releasePauseGuard();
            return;
        }

        try {
            if (
                !Number.isFinite(playbackVideo.currentTime) ||
                Math.abs(playbackVideo.currentTime - timestamp) > ANNOTATION_SEEK_TOLERANCE_SECONDS
            ) {
                playbackVideo.currentTime = timestamp;
            }
            playbackVideo.pause();
        } catch {
            releasePauseGuard();
        }
    }
    function enforceAnnotationPause(event: Event): void {
        if (state.captureSessionId !== captureSessionId) {
            releasePauseGuard();
            return;
        }
        if (Date.now() <= userPlaybackIntentExpiresAt) {
            releasePauseGuard();
            return;
        }
        if (event.target instanceof HTMLVideoElement) {
            seekAndPauseAtAnnotation(event.target);
        }
    }

    document.addEventListener('play', enforceAnnotationPause, true);
    document.addEventListener('playing', enforceAnnotationPause, true);
    window.addEventListener('keydown', handlePlaybackIntentKeydown, true);
    document.addEventListener('pointerdown', handlePlaybackIntentPointerdown, true);
    seekAndPauseAtAnnotation();

    openAnnotationEditor(note?.annotation || null).then((opened) => {
        if (!opened) {
            releasePauseGuard();
            if (state.captureSessionId === captureSessionId) {
                closeTooltip();
            }
            return;
        }
        if (state.captureSessionId !== captureSessionId) {
            releasePauseGuard();
            return;
        }

        seekAndPauseAtAnnotation();
        const editorRoot = document.getElementById('video-notes-annotation-root');
        if (editorRoot && typeof MutationObserver !== 'undefined') {
            editorRootObserver = new MutationObserver(() => {
                if (!editorRoot.isConnected) {
                    releasePauseGuard();
                }
            });
            editorRootObserver.observe(editorRoot.parentElement || document.body, { childList: true });
        }
    }).catch(() => {
        releasePauseGuard();
        if (state.captureSessionId === captureSessionId) {
            closeTooltip();
        }
    });
    return true;
};

const openAnnotationNoteById = (noteId: string): boolean => {
    const note = state.notes.find((entry) => entry.id === noteId);
    if (!note?.annotation) {
        return false;
    }

    if (isAnnotationEditorActive() && state.activeNoteId === note.id) {
        return true;
    }

    const noteDots = ui.track?.querySelectorAll<HTMLElement>('[data-note-id]') || [];
    const anchor = Array.from(noteDots).find((dot) => dot.dataset.noteId === note.id) || null;
    return startAnnotationCapture({ note, timestamp: note.timestamp, anchor });
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
    if (!state.videoId || !state.tooltipMode) {
        closeTooltip();
        return;
    }

    const captureSessionId = state.captureSessionId;
    const videoId = state.videoId;
    const activeNoteId = state.activeNoteId;
    if (persistingCaptureSessions.has(captureSessionId)) {
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
        const index = notes.findIndex((note) => note.id === activeNoteId);
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
        : notes.find((note) => note.id === activeNoteId);
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
    persistingCaptureSessions.add(captureSessionId);
    if (ui.saveButton) {
        ui.saveButton.disabled = true;
    }
    try {
        await persistNotesInOrder(videoId, notes);
        if (state.videoId !== videoId || state.captureSessionId !== captureSessionId) {
            return;
        }
        state.notes = notes;
        renderNotesTrack();
        closeTooltip();
    } catch {
        if (state.videoId !== videoId || state.captureSessionId !== captureSessionId) {
            return;
        }
        if (isAnnotationEditorActive()) {
            showAnnotationError('Unable to save. Your drawing is still open; please try again.');
        } else {
            showTooltipError('Unable to save this note. Your changes are still here; please try again.');
        }
    } finally {
        persistingCaptureSessions.delete(captureSessionId);
        if (ui.saveButton && state.captureSessionId === captureSessionId) {
            ui.saveButton.disabled = false;
        }
    }
};

const handleDelete = async (): Promise<void> => {
    if (!state.videoId || !state.activeNoteId) {
        return;
    }

    const captureSessionId = state.captureSessionId;
    const videoId = state.videoId;
    const activeNoteId = state.activeNoteId;
    if (persistingCaptureSessions.has(captureSessionId)) {
        return;
    }

    const filtered = state.notes.filter((note) => note.id !== activeNoteId);
    persistingCaptureSessions.add(captureSessionId);
    try {
        await persistNotesInOrder(videoId, filtered);
        if (state.videoId !== videoId || state.captureSessionId !== captureSessionId) {
            return;
        }
        state.notes = filtered;
        renderNotesTrack();
        closeTooltip();
    } catch {
        if (state.videoId !== videoId || state.captureSessionId !== captureSessionId) {
            return;
        }
        if (isAnnotationEditorActive()) {
            showAnnotationError('Unable to delete this annotation. Please try again.');
        } else {
            showTooltipError('Unable to delete this note. Please try again.');
        }
    } finally {
        persistingCaptureSessions.delete(captureSessionId);
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
    openAnnotationNoteById,
    renderNotesTrack,
    syncTooltipAnnotationControls,
    setEnsureUiReady
};
