import { HOLD_DURATION_MS } from './constants.js';
import { elements, state } from './state.js';

interface RenderHandlers {
    onDeleteNote: (videoId: string, noteKey: string) => void;
    onDeleteVideo: (videoId: string) => void;
    onExportVideo: (video: VideoListItem) => void;
    onOpenNote: (videoId: string, timestampSeconds: number | string) => void;
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

const render = (handlers: RenderHandlers): void => {
    const searchTrimmed = state.searchTerm.trim();
    const isSearchActive = searchTrimmed.length > 0;
    const renderable = computeRenderableVideos();

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

    renderable.forEach(({ video, displayNotes, forceExpanded }) => {
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

        const notesList = document.createElement('ul');
        notesList.className = 'notes-list';

        displayNotes.forEach((note) => {
            const noteItem = document.createElement('li');
            noteItem.className = 'note-item';

            const noteButton = document.createElement('button');
            noteButton.type = 'button';
            noteButton.className = 'note-button';
            noteButton.dataset.videoId = video.videoId;
            noteButton.dataset.timestamp = note.timestamp.toString();
            noteButton.dataset.noteKey = note.dedupKey;

            noteButton.addEventListener('click', () => handlers.onOpenNote(video.videoId, note.timestamp));

            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'note-button__timestamp';
            timestampSpan.textContent = note.formattedTimestamp;

            const textSpan = document.createElement('span');
            textSpan.className = 'note-button__text';
            textSpan.textContent = note.text;

            const noteDeleteButton = createDeleteButtonWithHold(
                () => handlers.onDeleteNote(video.videoId, note.dedupKey),
                `Delete note at ${note.formattedTimestamp}`
            );
            noteDeleteButton.classList.add('note-delete-button');

            noteButton.append(timestampSpan, textSpan);
            noteItem.append(noteButton, noteDeleteButton);
            notesList.appendChild(noteItem);
        });

        listItem.append(headerRow, notesList);
        videoList.appendChild(listItem);
    });
};

export type { RenderHandlers };
export { render };
