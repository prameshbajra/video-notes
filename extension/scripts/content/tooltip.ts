import { PREVIEW_OFFSET, TOOLTIP_OFFSET } from './constants.js';
import {
    closeAnnotationEditor,
    hasAnnotationContent,
    isAnnotationEditorActive,
    isAnnotationEditorTarget
} from './annotations.js';
import { state, ui } from './state.js';
import { formatTimestamp, getVideoElement } from './utils.js';

let globalListenersAttached = false;
let tooltipDismissCleanup: (() => void) | null = null;
let lastTrackHoverClientX: number | null = null;

const closeTooltip = (options: { resumePlayback?: boolean } = {}): void => {
    const { resumePlayback = true } = options;

    state.captureSessionId += 1;
    if (ui.tooltip) {
        ui.tooltip.style.display = 'none';
        ui.tooltip.style.visibility = 'visible';
    }
    if (ui.textarea) {
        ui.textarea.value = '';
    }
    if (ui.saveButton) {
        ui.saveButton.disabled = false;
    }
    closeAnnotationEditor();
    state.tooltipMode = null;
    state.captureKind = null;
    state.pendingTimestamp = null;
    state.activeNoteId = null;
    state.tooltipAnchor = null;
    if (ui.errorMessage) {
        ui.errorMessage.style.display = 'none';
        ui.errorMessage.textContent = '';
    }
    hideNotePreview();
    const resumeVideo = state.resumePlaybackVideo;
    if (
        resumePlayback &&
        resumeVideo &&
        typeof resumeVideo.play === 'function' &&
        resumeVideo.isConnected !== false
    ) {
        try {
            const playResult = resumeVideo.play();
            if (playResult && typeof playResult.catch === 'function') {
                playResult.catch(() => {});
            }
        } catch {
            // Ignore playback errors caused by browser policies or missing user gesture.
        }
    }
    state.resumePlaybackVideo = resumePlayback ? null : resumeVideo;
    if (typeof tooltipDismissCleanup === 'function') {
        tooltipDismissCleanup();
        tooltipDismissCleanup = null;
    }
};

const showTooltipError = (message: string): void => {
    if (!ui.errorMessage) {
        return;
    }
    ui.errorMessage.textContent = message;
    ui.errorMessage.style.display = 'block';
    repositionTooltip();
};

const syncTooltipAnnotationControls = (note: Note | null = null): void => {
    if (!ui.annotationActionButton) {
        return;
    }

    const canShowAction = state.isAnnotationsEnabled && state.tooltipMode === 'create' && !note;
    ui.annotationActionButton.style.display = canShowAction ? 'inline-flex' : 'none';
    ui.annotationActionButton.textContent = 'Add drawing';
    ui.annotationActionButton.setAttribute('aria-label', 'Create an annotation instead');

};

const resolveAnchor = (
    anchorCandidate: Element | null | undefined,
    fallbackNoteId: string | null,
    allowButtonFallback = true
): HTMLElement | null => {
    let reference = anchorCandidate instanceof HTMLElement ? anchorCandidate : null;
    if (reference && !reference.isConnected) {
        reference = null;
    }

    if (!reference && fallbackNoteId && ui.track) {
        const candidate = ui.track.querySelector<HTMLElement>(`[data-note-id="${fallbackNoteId}"]`);
        if (candidate) {
            reference = candidate;
        }
    }

    if (allowButtonFallback && !reference && ui.addButton && ui.addButton.isConnected) {
        reference = ui.addButton;
    }

    return reference;
};

const positionTooltip = (anchorCandidate: Element | null | undefined): void => {
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

const hideNotePreview = (): void => {
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

const positionPreviewTooltip = (): void => {
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

const showNotePreview = (note: Note, anchor: HTMLElement): void => {
    const hasPreviewContent = Boolean(note && (note.text || note.annotation));
    if (!ui.previewTooltip || !ui.previewText || !hasPreviewContent) {
        hideNotePreview();
        return;
    }

    state.previewNoteId = note.id;
    state.previewAnchor = anchor;
    ui.previewText.textContent = '';

    if (note.annotation) {
        const previewImage = document.createElement('img');
        previewImage.src = note.annotation.image.dataUrl;
        previewImage.alt = 'Drawing preview';
        previewImage.style.display = 'block';
        previewImage.style.width = '100%';
        previewImage.style.borderRadius = '8px';
        previewImage.style.border = '1px solid rgba(255, 255, 255, 0.14)';
        previewImage.style.backgroundColor = 'rgba(0, 0, 0, 0.35)';
        previewImage.style.marginBottom = note.text ? '8px' : '0';
        ui.previewText.appendChild(previewImage);
    }

    if (note.text) {
        ui.previewText.appendChild(document.createTextNode(note.text));
    }
    ui.previewTooltip.style.display = 'block';
    positionPreviewTooltip();
};

const hideTrackHoverTooltip = (options: { force?: boolean } = {}): void => {
    const { force = false } = options;
    if (!ui.trackHoverTooltip) {
        return;
    }

    if (
        !force &&
        state.tooltipAnchor === ui.trackHoverTooltip &&
        ui.tooltip &&
        ui.tooltip.style.display === 'flex'
    ) {
        return;
    }

    ui.trackHoverTooltip.style.display = 'none';
    ui.trackHoverTooltip.style.opacity = '0';
    ui.trackHoverTooltip.style.transform = 'translateY(2px)';
    ui.trackHoverTooltip.textContent = '';
    lastTrackHoverClientX = null;
};

const updateTrackHoverTooltip = (clientX: number): number | null => {
    if (!ui.track || !ui.trackHoverTooltip || !ui.container || !state.isEnabled) {
        return null;
    }

    const video = state.video || getVideoElement();
    if (video && !state.video) {
        state.video = video;
    }
    const duration =
        video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : null;
    if (!duration) {
        hideTrackHoverTooltip({ force: true });
        return null;
    }

    const trackRect = ui.track.getBoundingClientRect();
    if (!Number.isFinite(trackRect.width) || trackRect.width <= 0) {
        hideTrackHoverTooltip({ force: true });
        return null;
    }

    const clampedX = Math.min(Math.max(clientX, trackRect.left), trackRect.right);
    const positionRatio = (clampedX - trackRect.left) / trackRect.width;
    const timestamp = duration * positionRatio;
    lastTrackHoverClientX = clampedX;

    ui.trackHoverTooltip.textContent = `@ ${formatTimestamp(timestamp)}`;
    ui.trackHoverTooltip.style.display = 'block';
    ui.trackHoverTooltip.style.visibility = 'hidden';
    ui.trackHoverTooltip.style.opacity = '1';
    ui.trackHoverTooltip.style.transform = 'translateY(0)';

    const containerRect = ui.container.getBoundingClientRect();
    const tooltipRect = ui.trackHoverTooltip.getBoundingClientRect();

    const viewportSpaceAbove = trackRect.top;
    const viewportSpaceBelow = window.innerHeight - trackRect.bottom;
    let top = trackRect.top - containerRect.top - tooltipRect.height - PREVIEW_OFFSET;
    if (
        !Number.isFinite(top) ||
        (viewportSpaceAbove < tooltipRect.height + PREVIEW_OFFSET && viewportSpaceBelow > viewportSpaceAbove)
    ) {
        top = trackRect.bottom - containerRect.top + PREVIEW_OFFSET;
    }

    const centerX = clampedX - containerRect.left;
    let left = centerX - tooltipRect.width / 2;
    const maxLeft = Math.max(containerRect.width - tooltipRect.width, 0);
    left = Math.min(Math.max(left, 0), maxLeft);

    ui.trackHoverTooltip.style.top = `${top}px`;
    ui.trackHoverTooltip.style.left = `${left}px`;
    ui.trackHoverTooltip.style.visibility = 'visible';

    return timestamp;
};

const repositionTooltip = (): void => {
    if (ui.tooltip && ui.tooltip.style.display === 'flex') {
        positionTooltip(state.tooltipAnchor);
    }

    positionPreviewTooltip();
    if (ui.trackHoverTooltip && ui.trackHoverTooltip.style.display === 'block' && lastTrackHoverClientX !== null) {
        updateTrackHoverTooltip(lastTrackHoverClientX);
    }
};

const attachResponsiveListeners = (): void => {
    if (globalListenersAttached) {
        return;
    }

    globalListenersAttached = true;
    window.addEventListener('resize', repositionTooltip);
    window.addEventListener('orientationchange', repositionTooltip);
    window.addEventListener('scroll', repositionTooltip, true);
};

const attachTooltipDismissListener = (): void => {
    if (tooltipDismissCleanup) {
        return;
    }

    const handlePointerDown = (event: Event): void => {
        if (!ui.tooltip || ui.tooltip.style.display !== 'flex') {
            return;
        }

        // A stray click must never silently throw away a sketch; with an
        // empty canvas the dialog dismisses on outside clicks as it always
        // did for plain text notes.
        if (isAnnotationEditorActive() && hasAnnotationContent()) {
            return;
        }

        const target = event.target;
        if (target instanceof Node) {
            if (ui.tooltip.contains(target)) {
                return;
            }
            if (isAnnotationEditorTarget(target)) {
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

const openTooltip = ({
    mode,
    timestamp,
    note,
    anchor
}: {
    mode: Exclude<TooltipMode, null>;
    timestamp: number;
    note: Note | null;
    anchor?: HTMLElement | null;
}): void => {
    if (!ui.tooltip) {
        return;
    }

    state.captureSessionId += 1;
    state.tooltipMode = mode;
    state.captureKind = 'text';
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
    if (ui.saveButton) {
        ui.saveButton.disabled = false;
    }
    if (ui.errorMessage) {
        ui.errorMessage.style.display = 'none';
        ui.errorMessage.textContent = '';
    }
    syncTooltipAnnotationControls(note);

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

export {
    attachResponsiveListeners,
    closeTooltip,
    hideNotePreview,
    hideTrackHoverTooltip,
    openTooltip,
    repositionTooltip,
    showTooltipError,
    showNotePreview,
    syncTooltipAnnotationControls,
    updateTrackHoverTooltip
};
