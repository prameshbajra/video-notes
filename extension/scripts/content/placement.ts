import { CONTAINER_ID, PLACEMENT_ROOT_ID } from './constants.js';
import { state, themeState, ui } from './state.js';
import { persistPlacementPreference } from './storage.js';
import { applyStyles, createButton, getVideoElement } from './utils.js';

interface PickerCandidate {
    element: HTMLElement;
    position: PlacementPosition;
}

interface PickerElements {
    root: HTMLDivElement;
    banner: HTMLDivElement;
    message: HTMLSpanElement;
    highlight: HTMLDivElement;
    line: HTMLDivElement;
    placeholder: HTMLDivElement;
}

type PlacementResult = 'custom' | 'automatic' | 'youtube-fallback' | null;

const MIN_PICKER_WIDTH = 240;
const PLAYER_EDGE_TOLERANCE = 56;
let picker: PickerElements | null = null;
let pickerCandidate: PickerCandidate | null = null;
let isSavingPlacement = false;
let placementResizeObserver: ResizeObserver | null = null;

const stopPlacementTracking = (): void => {
    placementResizeObserver?.disconnect();
    placementResizeObserver = null;
};

const trackAnchorWidth = (container: HTMLDivElement, anchor: HTMLElement): void => {
    stopPlacementTracking();

    const syncWidth = (): void => {
        if (!container.isConnected || !anchor.isConnected) {
            return;
        }
        const width = anchor.getBoundingClientRect().width;
        if (width > 0) {
            container.style.maxWidth = `${width}px`;
        }
    };

    syncWidth();
    if (typeof ResizeObserver !== 'undefined') {
        placementResizeObserver = new ResizeObserver(syncWidth);
        placementResizeObserver.observe(anchor);
    }
};

const isInsertionParentCompatible = (element: HTMLElement): boolean => {
    const parent = element.parentElement;
    if (!parent) {
        return false;
    }

    const styles = window.getComputedStyle(parent);
    const clipsChildren = [styles.overflow, styles.overflowX, styles.overflowY].some(
        (value) => value === 'hidden' || value === 'clip'
    );
    if (clipsChildren) {
        return false;
    }

    if (styles.display === 'grid' || styles.display === 'inline-grid') {
        return false;
    }

    if (styles.display === 'flex' || styles.display === 'inline-flex') {
        return styles.flexDirection === 'column' || styles.flexDirection === 'column-reverse';
    }

    return styles.display !== 'inline' && styles.display !== 'contents';
};

const canInsertInFlow = (element: HTMLElement, position: PlacementPosition): boolean => {
    if (!element.parentElement || !isInsertionParentCompatible(element)) {
        return false;
    }

    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    applyStyles(probe, {
        display: 'block',
        width: '1px',
        height: '1px',
        margin: '0',
        padding: '0',
        border: '0',
        visibility: 'hidden',
        pointerEvents: 'none'
    });

    if (position === 'before') {
        element.insertAdjacentElement('beforebegin', probe);
    } else {
        element.insertAdjacentElement('afterend', probe);
    }

    const elementRect = element.getBoundingClientRect();
    const probeRect = probe.getBoundingClientRect();
    probe.remove();

    if (position === 'before') {
        return probeRect.bottom <= elementRect.top + 2;
    }
    return probeRect.top >= elementRect.bottom - 2;
};

const findAutomaticPlayerContainer = (video: HTMLVideoElement): HTMLElement | null => {
    const videoRect = video.getBoundingClientRect();
    if (videoRect.width <= 0 || videoRect.height <= 0) {
        return null;
    }

    const candidates: HTMLElement[] = [];
    let current = video.parentElement;
    let depth = 0;

    while (current && current !== document.body && depth < 12) {
        const rect = current.getBoundingClientRect();
        const styles = window.getComputedStyle(current);
        const wrapsVideoTightly =
            rect.width >= videoRect.width * 0.9 &&
            rect.width <= videoRect.width * 1.35 &&
            rect.top >= videoRect.top - PLAYER_EDGE_TOLERANCE &&
            rect.bottom <= videoRect.bottom + PLAYER_EDGE_TOLERANCE &&
            rect.left >= videoRect.left - PLAYER_EDGE_TOLERANCE &&
            rect.right <= videoRect.right + PLAYER_EDGE_TOLERANCE;
        const participatesInFlow = styles.position !== 'absolute' && styles.position !== 'fixed';

        if (wrapsVideoTightly && participatesInFlow && isInsertionParentCompatible(current)) {
            candidates.push(current);
        }

        current = current.parentElement;
        depth += 1;
    }

    for (const candidate of candidates.reverse()) {
        if (canInsertInFlow(candidate, 'after')) {
            return candidate;
        }
    }

    return null;
};

const locateYoutubeFallback = (): { anchor: Element; parent: Element } | null => {
    const title = document.querySelector('#primary-inner ytd-watch-metadata #title');
    const parent = title?.parentElement;
    if (!title || !parent) {
        return null;
    }
    return { anchor: title, parent };
};

const resolveElementAnchor = (anchor: ElementPlacementAnchor): HTMLElement | null => {
    for (const selector of anchor.selectors) {
        try {
            const element = document.querySelector<HTMLElement>(selector);
            if (element && !element.closest(`#${CONTAINER_ID}, #${PLACEMENT_ROOT_ID}`)) {
                return element;
            }
        } catch {
            continue;
        }
    }
    return null;
};

const resolvePlacementAnchor = (anchor: PlacementAnchor): HTMLElement | null => {
    if (anchor.kind === 'element') {
        return resolveElementAnchor(anchor);
    }

    const video = getVideoElement();
    return video ? findAutomaticPlayerContainer(video) : null;
};

const applyContainerSpacing = (
    container: HTMLDivElement,
    position: PlacementPosition,
    placement: Exclude<PlacementResult, null>
): void => {
    container.dataset.videoNotesPlacement = placement;
    container.style.width = '100%';
    container.style.boxSizing = 'border-box';
    container.style.margin = position === 'after' ? '24px auto 0' : '0 auto 24px';
};

const insertRelativeTo = (
    container: HTMLDivElement,
    anchor: HTMLElement,
    position: PlacementPosition,
    placement: 'custom' | 'automatic'
): boolean => {
    if (!anchor.isConnected || !anchor.parentElement || anchor.contains(container)) {
        return false;
    }

    if (!canInsertInFlow(anchor, position)) {
        return false;
    }

    anchor.insertAdjacentElement(position === 'before' ? 'beforebegin' : 'afterend', container);
    applyContainerSpacing(container, position, placement);
    trackAnchorWidth(container, anchor);
    return container.isConnected;
};

const placeAtYoutubeFallback = (container: HTMLDivElement): boolean => {
    const fallback = locateYoutubeFallback();
    if (!fallback) {
        return false;
    }

    fallback.parent.insertBefore(container, fallback.anchor);
    stopPlacementTracking();
    container.dataset.videoNotesPlacement = 'youtube-fallback';
    container.style.width = '100%';
    container.style.maxWidth = '100%';
    container.style.boxSizing = 'border-box';
    container.style.margin = '16px 0';
    return true;
};

const placeNotesContainer = (
    container: HTMLDivElement,
    preference: PlacementPreference | null
): PlacementResult => {
    if (preference) {
        const customAnchor = resolvePlacementAnchor(preference.anchor);
        if (customAnchor && insertRelativeTo(container, customAnchor, preference.position, 'custom')) {
            return 'custom';
        }
    }

    const video = getVideoElement();
    const automaticAnchor = video ? findAutomaticPlayerContainer(video) : null;
    if (automaticAnchor && insertRelativeTo(container, automaticAnchor, 'after', 'automatic')) {
        return 'automatic';
    }

    return placeAtYoutubeFallback(container) ? 'youtube-fallback' : null;
};

const isPointInsideRect = (x: number, y: number, rect: DOMRect): boolean =>
    x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;

const isSelectableElement = (element: HTMLElement): boolean => {
    if (!element.parentElement || element === document.body || element === document.documentElement) {
        return false;
    }

    if (element.closest(`#${CONTAINER_ID}, #${PLACEMENT_ROOT_ID}`)) {
        return false;
    }

    const rect = element.getBoundingClientRect();
    const styles = window.getComputedStyle(element);
    return (
        rect.width >= Math.min(MIN_PICKER_WIDTH, window.innerWidth * 0.35) &&
        rect.height >= 20 &&
        styles.display !== 'inline' &&
        styles.display !== 'contents' &&
        styles.visibility !== 'hidden' &&
        styles.position !== 'absolute' &&
        styles.position !== 'fixed' &&
        isInsertionParentCompatible(element)
    );
};

const findPickerElement = (target: Element, clientX: number, clientY: number): HTMLElement | null => {
    const video = getVideoElement();
    if (video) {
        const videoRect = video.getBoundingClientRect();
        if (isPointInsideRect(clientX, clientY, videoRect)) {
            return findAutomaticPlayerContainer(video);
        }
    }

    let current = target instanceof HTMLElement ? target : target.parentElement;
    let depth = 0;
    while (current && current !== document.body && depth < 10) {
        if (isSelectableElement(current)) {
            return current;
        }
        current = current.parentElement;
        depth += 1;
    }
    return null;
};

const setPickerVisibility = (isVisible: boolean): void => {
    if (!picker) {
        return;
    }
    const display = isVisible ? 'block' : 'none';
    picker.highlight.style.display = display;
    picker.line.style.display = display;
    picker.placeholder.style.display = display;
};

const renderPickerCandidate = (candidate: PickerCandidate | null): void => {
    pickerCandidate = candidate;
    if (!picker || !candidate) {
        setPickerVisibility(false);
        return;
    }

    const rect = candidate.element.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
        setPickerVisibility(false);
        return;
    }

    const boundary = candidate.position === 'before' ? rect.top : rect.bottom;
    const placeholderHeight = 64;
    const placeholderTop = candidate.position === 'before'
        ? boundary - placeholderHeight - 8
        : boundary + 8;
    const left = Math.max(8, rect.left);
    const width = Math.max(180, Math.min(rect.width, window.innerWidth - left - 8));

    applyStyles(picker.highlight, {
        display: 'block',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
        height: `${rect.height}px`
    });
    applyStyles(picker.line, {
        display: 'block',
        top: `${Math.max(0, boundary - 2)}px`,
        left: `${left}px`,
        width: `${width}px`
    });
    applyStyles(picker.placeholder, {
        display: 'flex',
        top: `${Math.max(8, Math.min(placeholderTop, window.innerHeight - placeholderHeight - 8))}px`,
        left: `${left}px`,
        width: `${width}px`,
        height: `${placeholderHeight}px`
    });
    picker.message.textContent = 'Click to place Video Notes in the highlighted gap';
};

const handlePickerPointerMove = (event: PointerEvent): void => {
    if (!picker || isSavingPlacement) {
        return;
    }

    const target = event.target;
    if (!(target instanceof Element) || picker.root.contains(target)) {
        return;
    }

    const element = findPickerElement(target, event.clientX, event.clientY);
    if (!element) {
        renderPickerCandidate(null);
        picker.message.textContent = 'Move over a full-width page section to choose an inline gap';
        return;
    }

    const rect = element.getBoundingClientRect();
    const position: PlacementPosition = event.clientY < rect.top + rect.height / 2 ? 'before' : 'after';
    renderPickerCandidate({ element, position });
};

const isUniqueSelector = (selector: string, element: HTMLElement): boolean => {
    try {
        const matches = document.querySelectorAll(selector);
        return matches.length === 1 && matches[0] === element;
    } catch {
        return false;
    }
};

const escapeAttributeValue = (value: string): string => value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

const getElementSegment = (element: HTMLElement): string => {
    const tag = element.tagName.toLowerCase();
    const stableClasses = Array.from(element.classList)
        .filter((className) => /^[a-zA-Z_][\w-]*$/.test(className))
        .slice(0, 2);
    const classSelector = stableClasses.map((className) => `.${CSS.escape(className)}`).join('');
    const siblings = element.parentElement
        ? Array.from(element.parentElement.children).filter((sibling) => sibling.tagName === element.tagName)
        : [];
    const index = siblings.indexOf(element);
    const indexSelector = siblings.length > 1 && index >= 0 ? `:nth-of-type(${index + 1})` : '';
    return `${tag}${classSelector}${indexSelector}`;
};

const buildElementSelectors = (element: HTMLElement): string[] => {
    const selectors: string[] = [];
    const addUniqueSelector = (selector: string): void => {
        if (!selectors.includes(selector) && isUniqueSelector(selector, element)) {
            selectors.push(selector);
        }
    };

    if (element.id) {
        addUniqueSelector(`#${CSS.escape(element.id)}`);
    }

    const testId = element.getAttribute('data-testid');
    if (testId) {
        addUniqueSelector(`${element.tagName.toLowerCase()}[data-testid="${escapeAttributeValue(testId)}"]`);
    }

    const role = element.getAttribute('role');
    const ariaLabel = element.getAttribute('aria-label');
    if (role && ariaLabel) {
        addUniqueSelector(
            `${element.tagName.toLowerCase()}[role="${escapeAttributeValue(role)}"][aria-label="${escapeAttributeValue(ariaLabel)}"]`
        );
    }

    const classSegment = getElementSegment(element).replace(/:nth-of-type\(\d+\)$/, '');
    addUniqueSelector(classSegment);

    const path: string[] = [];
    let current: HTMLElement | null = element;
    let depth = 0;
    while (current && current !== document.body && depth < 5) {
        if (current.id) {
            path.unshift(`#${CSS.escape(current.id)}`);
            addUniqueSelector(path.join(' > '));
            break;
        }
        path.unshift(getElementSegment(current));
        const selector = path.join(' > ');
        if (isUniqueSelector(selector, element)) {
            addUniqueSelector(selector);
            break;
        }
        current = current.parentElement;
        depth += 1;
    }

    return selectors.slice(0, 6);
};

const createPreference = (candidate: PickerCandidate): PlacementPreference | null => {
    const video = getVideoElement();
    const player = video ? findAutomaticPlayerContainer(video) : null;
    if (player === candidate.element) {
        return {
            version: 1,
            mode: 'custom',
            position: candidate.position,
            anchor: { kind: 'player' },
            updatedAt: Date.now()
        };
    }

    const selectors = buildElementSelectors(candidate.element);
    if (selectors.length === 0) {
        return null;
    }

    return {
        version: 1,
        mode: 'custom',
        position: candidate.position,
        anchor: { kind: 'element', selectors },
        updatedAt: Date.now()
    };
};

const detachPickerListeners = (): void => {
    window.removeEventListener('pointermove', handlePickerPointerMove, true);
    window.removeEventListener('click', handlePickerClick, true);
    window.removeEventListener('keydown', handlePickerKeydown, true);
    window.removeEventListener('scroll', handlePickerViewportChange, true);
    window.removeEventListener('resize', handlePickerViewportChange);
};

const stopPlacementMode = (): void => {
    detachPickerListeners();
    picker?.root.remove();
    picker = null;
    pickerCandidate = null;
    isSavingPlacement = false;
    state.isPlacementModeActive = false;
    if (ui.container) {
        ui.container.style.opacity = '1';
    }
    ui.moveButton?.focus({ preventScroll: true });
};

const commitPickerCandidate = async (candidate: PickerCandidate): Promise<void> => {
    if (!picker || isSavingPlacement) {
        return;
    }

    const preference = createPreference(candidate);
    if (!preference) {
        picker.message.textContent = 'That location cannot be remembered. Choose a larger page section.';
        return;
    }

    isSavingPlacement = true;
    picker.message.textContent = 'Saving panel position…';
    try {
        await persistPlacementPreference(preference);
        state.placementPreference = preference;
        const container = ui.container;
        stopPlacementMode();
        if (container) {
            placeNotesContainer(container, preference);
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } catch {
        isSavingPlacement = false;
        if (picker) {
            picker.message.textContent = 'Unable to save this position. Please try again.';
        }
    }
};

function handlePickerClick(event: MouseEvent): void {
    if (!picker || picker.root.contains(event.target as Node)) {
        return;
    }

    event.preventDefault();
    event.stopImmediatePropagation();
    if (pickerCandidate) {
        commitPickerCandidate(pickerCandidate).catch(() => {});
    }
}

function handlePickerKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Escape') {
        return;
    }
    event.preventDefault();
    stopPlacementMode();
}

function handlePickerViewportChange(): void {
    renderPickerCandidate(null);
}

const resetPlacement = async (): Promise<void> => {
    if (isSavingPlacement) {
        return;
    }
    isSavingPlacement = true;
    if (picker) {
        picker.message.textContent = 'Restoring automatic position…';
    }

    try {
        await persistPlacementPreference(null);
        state.placementPreference = null;
        const container = ui.container;
        stopPlacementMode();
        if (container) {
            placeNotesContainer(container, null);
            container.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
    } catch {
        isSavingPlacement = false;
        if (picker) {
            picker.message.textContent = 'Unable to reset the position. Please try again.';
        }
    }
};

const createPicker = (): PickerElements | null => {
    if (!document.body) {
        return null;
    }

    const palette = themeState.palette;
    const root = document.createElement('div');
    root.id = PLACEMENT_ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'false');
    root.setAttribute('aria-label', 'Choose Video Notes position');
    root.tabIndex = -1;
    applyStyles(root, {
        position: 'fixed',
        inset: '0',
        zIndex: '2147483647',
        pointerEvents: 'none',
        fontFamily: 'Roboto, Arial, sans-serif'
    });

    const banner = document.createElement('div');
    applyStyles(banner, {
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        maxWidth: 'calc(100vw - 32px)',
        padding: '10px 12px 10px 16px',
        borderRadius: '999px',
        backgroundColor: palette.tooltipBackground,
        color: palette.tooltipText,
        border: palette.surfaceBorder,
        boxShadow: palette.tooltipShadow,
        pointerEvents: 'auto',
        flexWrap: 'wrap'
    });

    const message = document.createElement('span');
    message.textContent = 'Move over a full-width page section to choose an inline gap';
    applyStyles(message, { fontSize: '13px', fontWeight: '600' });

    const resetButton = createButton('Use automatic', {
        border: palette.surfaceBorder,
        borderRadius: '999px',
        padding: '6px 10px',
        backgroundColor: palette.surfaceMuted,
        color: palette.textPrimary,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '600'
    });
    resetButton.setAttribute('aria-label', 'Reset Video Notes to automatic position');
    resetButton.addEventListener('click', () => {
        resetPlacement().catch(() => {});
    });

    const cancelButton = createButton('Cancel', {
        border: 'none',
        borderRadius: '999px',
        padding: '6px 10px',
        backgroundColor: 'transparent',
        color: palette.textSecondary,
        cursor: 'pointer',
        fontSize: '12px',
        fontWeight: '600'
    });
    cancelButton.addEventListener('click', stopPlacementMode);

    banner.appendChild(message);
    banner.appendChild(resetButton);
    banner.appendChild(cancelButton);

    const highlight = document.createElement('div');
    applyStyles(highlight, {
        position: 'fixed',
        display: 'none',
        border: `2px solid ${palette.accent}`,
        borderRadius: '8px',
        backgroundColor: palette.accentMuted,
        boxSizing: 'border-box',
        pointerEvents: 'none'
    });

    const line = document.createElement('div');
    applyStyles(line, {
        position: 'fixed',
        display: 'none',
        height: '4px',
        borderRadius: '999px',
        backgroundColor: palette.accent,
        boxShadow: `0 0 0 4px ${palette.accentMuted}`,
        pointerEvents: 'none'
    });

    const placeholder = document.createElement('div');
    placeholder.textContent = 'Video Notes will appear here';
    applyStyles(placeholder, {
        position: 'fixed',
        display: 'none',
        alignItems: 'center',
        justifyContent: 'center',
        border: `2px dashed ${palette.accent}`,
        borderRadius: '12px',
        backgroundColor: palette.accentMuted,
        color: palette.textPrimary,
        fontSize: '14px',
        fontWeight: '700',
        boxSizing: 'border-box',
        pointerEvents: 'none'
    });

    root.appendChild(highlight);
    root.appendChild(line);
    root.appendChild(placeholder);
    root.appendChild(banner);
    document.body.appendChild(root);
    root.focus({ preventScroll: true });
    return { root, banner, message, highlight, line, placeholder };
};

const startPlacementMode = (): boolean => {
    if (state.isPlacementModeActive) {
        return true;
    }

    const container = ui.container;
    if (!container || !container.isConnected) {
        return false;
    }

    picker = createPicker();
    if (!picker) {
        return false;
    }

    state.isPlacementModeActive = true;
    container.style.opacity = '0.35';
    window.addEventListener('pointermove', handlePickerPointerMove, true);
    window.addEventListener('click', handlePickerClick, true);
    window.addEventListener('keydown', handlePickerKeydown, true);
    window.addEventListener('scroll', handlePickerViewportChange, true);
    window.addEventListener('resize', handlePickerViewportChange);
    return true;
};

export {
    findAutomaticPlayerContainer,
    placeNotesContainer,
    resetPlacement,
    startPlacementMode,
    stopPlacementMode,
    stopPlacementTracking
};
