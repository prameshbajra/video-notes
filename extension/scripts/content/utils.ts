const applyStyles = (element: HTMLElement, styles: Partial<CSSStyleDeclaration>): void => {
    Object.assign(element.style, styles);
};

const createButton = (label: string, styles: Partial<CSSStyleDeclaration>): HTMLButtonElement => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = label;
    applyStyles(button, styles);
    return button;
};

const isEditableTarget = (target: EventTarget | null): boolean => {
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

const getVisibleArea = (rect: DOMRect): number => {
    const visibleWidth = Math.max(0, Math.min(rect.right, window.innerWidth) - Math.max(rect.left, 0));
    const visibleHeight = Math.max(0, Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0));
    return visibleWidth * visibleHeight;
};

const scoreVideoElement = (video: HTMLVideoElement): number => {
    const rect = video.getBoundingClientRect();
    const styles = window.getComputedStyle(video);
    if (
        styles.display === 'none' ||
        styles.visibility === 'hidden' ||
        Number(styles.opacity) === 0 ||
        rect.width < 240 ||
        rect.height < 135
    ) {
        return Number.NEGATIVE_INFINITY;
    }

    const aspectRatio = rect.width / rect.height;
    const isLandscape = aspectRatio >= 1.2;
    const area = rect.width * rect.height;
    const visibleArea = getVisibleArea(rect);
    const playbackBonus = !video.paused && !video.ended ? 10_000_000 : 0;
    const landscapeBonus = isLandscape ? 2_000_000 : -2_000_000;
    const longFormBonus = aspectRatio >= 1.5 && aspectRatio <= 2.8 ? 1_000_000 : 0;

    return playbackBonus + landscapeBonus + longFormBonus + area + visibleArea;
};

const getVideoElement = (): HTMLVideoElement | null => {
    const videos = Array.from(document.querySelectorAll<HTMLVideoElement>('video'));
    const genericMatch = videos
        .map((video) => ({ score: scoreVideoElement(video), video }))
        .filter(({ score }) => Number.isFinite(score))
        .sort((left, right) => right.score - left.score)[0]?.video;

    if (genericMatch) {
        return genericMatch;
    }

    return document.querySelector<HTMLVideoElement>('video.html5-main-video');
};

const formatTimestamp = (value: number): string => {
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

const getVideoIdFromLocation = (): string | null => {
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
    } catch {
        return null;
    }

    return null;
};

export {
    applyStyles,
    createButton,
    formatTimestamp,
    getVideoElement,
    getVideoIdFromLocation,
    isEditableTarget
};
