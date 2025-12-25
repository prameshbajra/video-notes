const state: ExtensionState = {
    video: null,
    videoId: null,
    notes: [],
    tooltipMode: null,
    activeNoteId: null,
    pendingTimestamp: null,
    tooltipAnchor: null,
    previewAnchor: null,
    previewNoteId: null,
    resumePlaybackVideo: null,
    isEnabled: true,
    isZenModeEnabled: false
};

const ui: UiElements = {
    container: null,
    addButton: null,
    zenButton: null,
    track: null,
    trackBaseline: null,
    tooltip: null,
    textarea: null,
    cancelButton: null,
    saveButton: null,
    deleteButton: null,
    heading: null,
    timestampLabel: null,
    emptyState: null,
    previewTooltip: null,
    previewText: null,
    trackHoverTooltip: null
};

const themePalettes: Record<ThemeMode, ThemePalette> = {
    dark: {
        textPrimary: '#f1f1f1',
        textSecondary: '#aaaaaa',
        surfaceMuted: 'rgba(255, 255, 255, 0.06)',
        surfaceBorder: '1px solid rgba(255, 255, 255, 0.08)',
        surfaceBaseline: 'rgba(255, 255, 255, 0.2)',
        tooltipBackground: '#202124',
        tooltipText: '#ffffff',
        tooltipShadow: '0 10px 30px rgba(0, 0, 0, 0.35)',
        textareaBackground: '#121212',
        textareaText: '#ffffff',
        textareaBorder: '1px solid #3f3f3f',
        deleteText: '#ff7b7b',
        deleteBorder: '1px solid rgba(255, 123, 123, 0.6)',
        cancelText: '#aaaaaa',
        previewBackground: 'rgba(32, 33, 36, 0.95)',
        previewBorder: '1px solid rgba(255, 255, 255, 0.08)',
        previewShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        previewText: '#ffffff',
        noteDotBorder: '1px solid rgba(10, 28, 46, 0.6)',
        noteDotShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
        noteDotShadowActive: '0 6px 14px rgba(62, 166, 255, 0.5)'
    },
    light: {
        textPrimary: '#0f0f0f',
        textSecondary: '#606060',
        surfaceMuted: 'rgba(0, 0, 0, 0.04)',
        surfaceBorder: '1px solid rgba(0, 0, 0, 0.08)',
        surfaceBaseline: 'rgba(0, 0, 0, 0.15)',
        tooltipBackground: '#ffffff',
        tooltipText: '#0f0f0f',
        tooltipShadow: '0 12px 30px rgba(15, 23, 42, 0.16)',
        textareaBackground: '#ffffff',
        textareaText: '#0f0f0f',
        textareaBorder: '1px solid rgba(0, 0, 0, 0.12)',
        deleteText: '#b3261e',
        deleteBorder: '1px solid rgba(179, 38, 30, 0.35)',
        cancelText: '#5f6368',
        previewBackground: 'rgba(255, 255, 255, 0.98)',
        previewBorder: '1px solid rgba(15, 23, 42, 0.08)',
        previewShadow: '0 10px 28px rgba(15, 23, 42, 0.14)',
        previewText: '#202124',
        noteDotBorder: '1px solid rgba(10, 28, 46, 0.25)',
        noteDotShadow: '0 3px 8px rgba(15, 23, 42, 0.16)',
        noteDotShadowActive: '0 6px 14px rgba(62, 166, 255, 0.4)'
    }
};

const themeState: ThemeState = {
    mode: null,
    palette: themePalettes.dark
};

export { state, themePalettes, themeState, ui };
