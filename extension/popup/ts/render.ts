import { copyToClipboard } from './clipboard.js';
import { HOLD_DURATION_MS, NOTE_RENDER_BATCH_SIZE, VIDEO_RENDER_BATCH_SIZE } from './constants.js';
import { elements, showToast, state } from './state.js';

interface RenderHandlers {
    onDeleteNote: (videoId: string, noteKey: string) => void;
    onDeleteVideo: (videoId: string) => void;
    onExportVideo: (video: VideoListItem) => void;
    onShareVideo: (video: VideoListItem) => void;
    onOpenNote: (videoId: string, note: NormalizedNote) => void;
    onShowMoreNotes: (videoId: string) => void;
    onShowMoreVideos: () => void;
    onToggleVideo: (videoId: string) => void;
}

const computeRenderableVideos = (): Array<{
    video: VideoListItem;
    displayNotes: NormalizedNote[];
    forceExpanded: boolean;
}> => {
    const trimmedTerm = state.searchTerm.trim();
    const isSearchActive = trimmedTerm.length > 0;
    if (!isSearchActive) {
        return state.videos.map((video) => ({
            video,
            displayNotes: video.notes,
            forceExpanded: false
        }));
    }

    const normalizedTerm = trimmedTerm.toLowerCase();
    const matches: Array<{
        video: VideoListItem;
        displayNotes: NormalizedNote[];
        forceExpanded: boolean;
    }> = [];

    state.videos.forEach((video) => {
        const titleMatch = video.titleLower.includes(normalizedTerm);
        const matchingNotes = video.notes.filter((note) => note.textLower.includes(normalizedTerm));
        if (!titleMatch && matchingNotes.length === 0) {
            return;
        }

        matches.push({
            video,
            displayNotes: titleMatch ? video.notes : matchingNotes,
            forceExpanded: true
        });
    });

    return matches;
};

const createDeleteIcon = (): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'delete-button__icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M6 6l12 12M6 18 18 6');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');

    svg.appendChild(path);
    return svg;
};

const createExportIcon = (): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'export-button__icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path1.setAttribute('d', 'M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1z');
    path1.setAttribute('stroke', 'currentColor');
    path1.setAttribute('stroke-width', '1.8');
    path1.setAttribute('stroke-linecap', 'round');
    path1.setAttribute('stroke-linejoin', 'round');
    path1.setAttribute('fill', 'none');

    const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path2.setAttribute('d', 'M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z');
    path2.setAttribute('stroke', 'currentColor');
    path2.setAttribute('stroke-width', '1.8');
    path2.setAttribute('stroke-linecap', 'round');
    path2.setAttribute('stroke-linejoin', 'round');
    path2.setAttribute('fill', 'none');

    svg.appendChild(path1);
    svg.appendChild(path2);
    return svg;
};

const createShareIcon = (): SVGSVGElement => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('class', 'share-button__icon');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8M16 6l-4-4-4 4M12 2v13');
    path.setAttribute('stroke', 'currentColor');
    path.setAttribute('stroke-width', '1.8');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('fill', 'none');

    svg.appendChild(path);
    return svg;
};

const createDeleteButtonWithHold = (deleteAction: () => void, ariaLabel: string): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'delete-chip';
    button.setAttribute('aria-label', ariaLabel);
    button.setAttribute('tabindex', '0');
    button.appendChild(createDeleteIcon());

    if (!state.isDeleteHoldEnabled) {
        button.addEventListener(
            'click',
            (event) => {
                event.preventDefault();
                event.stopPropagation();
                deleteAction();
            },
            true
        );
        return button;
    }

    let holdStartTime: number | null = null;
    let animationFrameId: number | null = null;
    let holdTimeoutId: number | null = null;

    const cancelHold = (): void => {
        if (holdStartTime !== null) {
            holdStartTime = null;
            button.classList.remove('delete-chip--holding');
            button.style.setProperty('--hold-progress', '0');
            button.style.setProperty('--hold-progress-deg', '0deg');
            button.style.setProperty('--hold-progress-radius', '0px');
        }
        if (animationFrameId !== null) {
            cancelAnimationFrame(animationFrameId);
            animationFrameId = null;
        }
        if (holdTimeoutId !== null) {
            clearTimeout(holdTimeoutId);
            holdTimeoutId = null;
        }
    };

    const updateProgress = (): void => {
        if (holdStartTime === null) {
            return;
        }

        const elapsed = Date.now() - holdStartTime;
        const normalizedTime = Math.min(elapsed / HOLD_DURATION_MS, 1);
        const progress = 1 - Math.pow(1 - normalizedTime, 3);
        const progressPercent = progress * 100;
        const progressDegrees = progressPercent * 3.6;
        const innerProgress = 1 - Math.pow(1 - normalizedTime, 4);
        const progressRadius = innerProgress * 100 * 0.17;

        button.style.setProperty('--hold-progress', `${progressPercent}`);
        button.style.setProperty('--hold-progress-deg', `${progressDegrees}deg`);
        button.style.setProperty('--hold-progress-radius', `${progressRadius}px`);

        if (normalizedTime >= 1) {
            cancelHold();
            deleteAction();
        } else {
            animationFrameId = requestAnimationFrame(updateProgress);
        }
    };

    const startHold = (): void => {
        if (holdStartTime !== null) {
            return;
        }
        holdStartTime = Date.now();
        button.classList.add('delete-chip--holding');
        button.style.setProperty('--hold-progress', '0');
        button.style.setProperty('--hold-progress-deg', '0deg');
        button.style.setProperty('--hold-progress-radius', '0px');
        animationFrameId = requestAnimationFrame(updateProgress);
    };

    button.addEventListener(
        'click',
        (event) => {
            event.preventDefault();
            event.stopPropagation();
        },
        true
    );

    const handlePointerDown = (event: MouseEvent | TouchEvent): void => {
        event.preventDefault();
        event.stopPropagation();
        startHold();
    };

    button.addEventListener('mousedown', handlePointerDown, true);
    button.addEventListener('touchstart', handlePointerDown as EventListener, { passive: false, capture: true });

    button.addEventListener('mouseup', cancelHold, true);
    button.addEventListener('touchend', cancelHold, true);
    button.addEventListener('mouseleave', cancelHold, true);
    button.addEventListener('touchcancel', cancelHold, true);

    return button;
};

const createPaginationButton = (label: string, ariaLabel: string, onClick: () => void): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'pagination-button';
    button.setAttribute('aria-label', ariaLabel);
    button.textContent = label;
    button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
    });
    return button;
};

const render = (handlers: RenderHandlers): void => {
    const searchTrimmed = state.searchTerm.trim();
    const isSearchActive = searchTrimmed.length > 0;
    const renderable = computeRenderableVideos();
    const visibleRenderable = renderable.slice(0, state.visibleVideoLimit);
    const hiddenVideoCount = Math.max(0, renderable.length - visibleRenderable.length);

    const { videoList, emptyState } = elements;
    if (!videoList || !emptyState) {
        return;
    }

    videoList.textContent = '';

    if (state.videos.length === 0) {
        emptyState.hidden = false;
        emptyState.textContent = 'You have not saved any notes yet.';
        return;
    }

    if (renderable.length === 0) {
        emptyState.hidden = false;
        emptyState.textContent = `No matches for "${searchTrimmed}".`;
        return;
    }

    emptyState.hidden = true;

    visibleRenderable.forEach(({ video, displayNotes, forceExpanded }) => {
        const listItem = document.createElement('li');
        listItem.className = 'video-item';

        const isExpanded = isSearchActive || forceExpanded || state.expandedVideos.has(video.videoId);
        if (isExpanded) {
            listItem.classList.add('video-item--expanded');
        }

        const headerRow = document.createElement('div');
        headerRow.className = 'video-header-row';

        const headerButton = document.createElement('button');
        headerButton.type = 'button';
        headerButton.className = 'video-header';
        headerButton.dataset.videoId = video.videoId;
        if (isSearchActive) {
            headerButton.classList.add('video-header--static');
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'video-header__title';
        titleSpan.textContent = video.title;

        const countSpan = document.createElement('span');
        countSpan.className = 'video-header__count';
        const matchingCountLabel =
            isSearchActive && displayNotes.length !== video.noteCount
                ? `${displayNotes.length} of ${video.noteCount} notes`
                : `${video.noteCount} ${video.noteCount === 1 ? 'note' : 'notes'}`;
        countSpan.textContent = matchingCountLabel;

        const chevronSpan = document.createElement('span');
        chevronSpan.className = 'video-header__chevron';
        chevronSpan.setAttribute('aria-hidden', 'true');

        headerButton.append(titleSpan, countSpan, chevronSpan);

        if (!isSearchActive) {
            headerButton.addEventListener('click', () => handlers.onToggleVideo(video.videoId));
        }

        const videoDeleteButton = createDeleteButtonWithHold(
            () => handlers.onDeleteVideo(video.videoId),
            `Delete all notes for "${video.title}"`
        );
        videoDeleteButton.classList.add('video-delete-button');

        const buttons: HTMLElement[] = [headerButton];

        const videoShareButton = document.createElement('button');
        videoShareButton.type = 'button';
        videoShareButton.className = 'export-chip video-share-button';
        videoShareButton.setAttribute('aria-label', `Share notes for "${video.title}"`);
        videoShareButton.appendChild(createShareIcon());
        videoShareButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            handlers.onShareVideo(video);
        });
        buttons.push(videoShareButton);

        if (state.isMdExportEnabled) {
            const videoExportButton = document.createElement('button');
            videoExportButton.type = 'button';
            videoExportButton.className = 'export-chip video-export-button';
            videoExportButton.setAttribute('aria-label', `Copy notes for "${video.title}" as markdown`);
            videoExportButton.appendChild(createExportIcon());
            videoExportButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handlers.onExportVideo(video);
            });
            buttons.push(videoExportButton);
        }

        buttons.push(videoDeleteButton);
        headerRow.append(...buttons);

        const listChildren: HTMLElement[] = [headerRow];

        const sharedUrl = state.sharedUrls.get(video.videoId);
        if (sharedUrl) {
            const shareLinkBar = document.createElement('div');
            shareLinkBar.className = 'share-link-bar';

            const urlSpan = document.createElement('span');
            urlSpan.className = 'share-link-bar__url';
            urlSpan.textContent = sharedUrl;
            urlSpan.title = sharedUrl;

            const copyBtn = document.createElement('button');
            copyBtn.type = 'button';
            copyBtn.className = 'share-link-bar__copy';
            copyBtn.textContent = 'Copy link';
            copyBtn.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                copyToClipboard(sharedUrl)
                    .then(() => showToast('Link copied to clipboard!', 'success'))
                    .catch(() => showToast('Failed to copy link.', 'error'));
            });

            shareLinkBar.append(urlSpan, copyBtn);
            listChildren.push(shareLinkBar);
        }

        if (isExpanded) {
            const notesList = document.createElement('ul');
            notesList.className = 'notes-list';

            const visibleNotesLimit = state.visibleNotesByVideo.get(video.videoId) || NOTE_RENDER_BATCH_SIZE;
            const visibleNotes = displayNotes.slice(0, visibleNotesLimit);
            const hiddenNoteCount = Math.max(0, displayNotes.length - visibleNotes.length);

            visibleNotes.forEach((note) => {
                const noteItem = document.createElement('li');
                noteItem.className = 'note-item';

                const noteButton = document.createElement('button');
                noteButton.type = 'button';
                noteButton.className = 'note-button';
                noteButton.dataset.videoId = video.videoId;
                noteButton.dataset.timestamp = note.timestamp.toString();
                noteButton.dataset.noteKey = note.dedupKey;

                noteButton.addEventListener('click', () => handlers.onOpenNote(video.videoId, note));

                const timestampSpan = document.createElement('span');
                timestampSpan.className = 'note-button__timestamp';
                timestampSpan.textContent = note.formattedTimestamp;

                const textSpan = document.createElement('span');
                textSpan.className = 'note-button__text';
                textSpan.textContent = note.displayText;

                const noteDeleteButton = createDeleteButtonWithHold(
                    () => handlers.onDeleteNote(video.videoId, note.dedupKey),
                    `Delete note at ${note.formattedTimestamp}`
                );
                noteDeleteButton.classList.add('note-delete-button');

                noteButton.append(timestampSpan, textSpan);

                if (note.annotation) {
                    const annotationBadge = document.createElement('span');
                    annotationBadge.className = 'note-annotation-badge';
                    annotationBadge.textContent = 'Drawing';
                    annotationBadge.title = 'This note includes a drawing on the video';
                    noteButton.appendChild(annotationBadge);
                }

                noteItem.append(noteButton, noteDeleteButton);
                notesList.appendChild(noteItem);
            });

            if (hiddenNoteCount > 0) {
                const moreNotesItem = document.createElement('li');
                moreNotesItem.className = 'notes-pagination-item';
                const nextNoteCount = Math.min(NOTE_RENDER_BATCH_SIZE, hiddenNoteCount);
                const moreNotesButton = createPaginationButton(
                    `Show ${nextNoteCount} more ${nextNoteCount === 1 ? 'note' : 'notes'}`,
                    `Show more notes for "${video.title}"`,
                    () => handlers.onShowMoreNotes(video.videoId)
                );
                moreNotesButton.classList.add('pagination-button--notes');
                moreNotesItem.appendChild(moreNotesButton);
                notesList.appendChild(moreNotesItem);
            }

            listChildren.push(notesList);
        }

        listItem.append(...listChildren);
        videoList.appendChild(listItem);
    });

    if (hiddenVideoCount > 0) {
        const paginationItem = document.createElement('li');
        paginationItem.className = 'video-pagination-item';
        const nextVideoCount = Math.min(VIDEO_RENDER_BATCH_SIZE, hiddenVideoCount);
        const moreVideosButton = createPaginationButton(
            `Show ${nextVideoCount} more ${nextVideoCount === 1 ? 'video' : 'videos'}`,
            'Show more videos',
            handlers.onShowMoreVideos
        );
        moreVideosButton.classList.add('pagination-button--videos');
        paginationItem.appendChild(moreVideosButton);
        videoList.appendChild(paginationItem);
    }
};

export type { RenderHandlers };
export { render };
