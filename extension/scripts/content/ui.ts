import { CONTAINER_ID, PREVIEW_TOOLTIP_ID, TOOLTIP_ID, TRACK_HOVER_TOOLTIP_ID, TRACK_ID } from './constants.js';
import { applyStyles, createButton } from './utils.js';

const createTooltip = (
    palette: ThemePalette
): Pick<
    UiElements,
    'tooltip' | 'heading' | 'timestampLabel' | 'textarea' | 'deleteButton' | 'cancelButton' | 'saveButton'
> => {
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

const createPreviewTooltip = (palette: ThemePalette): Pick<UiElements, 'previewTooltip' | 'previewText'> => {
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

const createTrackHoverTooltip = (palette: ThemePalette): HTMLDivElement => {
    const tooltip = document.createElement('div');
    tooltip.id = TRACK_HOVER_TOOLTIP_ID;
    tooltip.setAttribute('aria-hidden', 'true');
    applyStyles(tooltip, {
        position: 'absolute',
        top: '0',
        left: '0',
        display: 'none',
        padding: '6px 8px',
        borderRadius: '8px',
        backgroundColor: palette.previewBackground,
        color: palette.previewText,
        fontSize: '12px',
        lineHeight: '1.2',
        boxShadow: palette.previewShadow,
        border: palette.previewBorder,
        pointerEvents: 'none',
        whiteSpace: 'nowrap',
        zIndex: '4999',
        transition: 'transform 120ms ease, opacity 120ms ease'
    });

    return tooltip;
};

const createContainer = (palette: ThemePalette): UiElements => {
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

    const actions = document.createElement('div');
    applyStyles(actions, {
        display: 'flex',
        alignItems: 'center',
        gap: '8px'
    });

    const zenButton = createButton('Zen mode', {
        borderRadius: '999px',
        border: palette.surfaceBorder,
        backgroundColor: palette.surfaceMuted,
        color: palette.textPrimary,
        fontSize: '13px',
        fontWeight: '600',
        lineHeight: '1.2',
        cursor: 'pointer',
        padding: '6px 12px'
    });
    zenButton.id = 'video-notes-zen-button';
    zenButton.setAttribute('aria-pressed', 'false');
    zenButton.setAttribute('aria-label', 'Toggle Zen mode');

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

    header.appendChild(title);
    actions.appendChild(zenButton);
    actions.appendChild(addButton);
    header.appendChild(actions);

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
    emptyState.innerHTML =
        'No notes yet. Click \u201c+ Add note\u201d to save your thoughts. <br>Use Alt + N (Windows) or Option + N (Mac) to create a new note, and Ctrl + Enter to save it.';
    applyStyles(emptyState, {
        color: palette.textSecondary,
        fontSize: '13px'
    });

    const { tooltip, heading, timestampLabel, textarea, deleteButton, cancelButton, saveButton } =
        createTooltip(palette);
    const { previewTooltip, previewText } = createPreviewTooltip(palette);
    const trackHoverTooltip = createTrackHoverTooltip(palette);

    container.appendChild(header);
    container.appendChild(track);
    container.appendChild(emptyState);
    container.appendChild(trackHoverTooltip);
    if (tooltip) {
        container.appendChild(tooltip);
    }
    if (previewTooltip) {
        container.appendChild(previewTooltip);
    }

    return {
        container,
        addButton,
        zenButton,
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
        trackHoverTooltip
    };
};

export { createContainer };
