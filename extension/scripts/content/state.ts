const state: ExtensionState = {
    video: null,
    videoId: null,
    notes: [],
    tooltipMode: null,
    captureKind: null,
    activeNoteId: null,
    pendingTimestamp: null,
    tooltipAnchor: null,
    previewAnchor: null,
    previewNoteId: null,
    resumePlaybackVideo: null,
    isEnabled: true,
    isZenModeEnabled: false,
    isAnnotationsEnabled: true,
    captureSessionId: 0
};

const ui: UiElements = {
    container: null,
    addButton: null,
    annotateButton: null,
    zenButton: null,
    shareButton: null,
    track: null,
    trackBaseline: null,
    tooltip: null,
    textarea: null,
    cancelButton: null,
    saveButton: null,
    deleteButton: null,
    annotationActionButton: null,
    errorMessage: null,
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
        tooltipBackground: '#1c1c20',
        tooltipText: '#ffffff',
        tooltipShadow: '0 8px 24px rgba(0, 0, 0, 0.32), 0 1px 0 rgba(255, 255, 255, 0.03) inset',
        textareaBackground: '#0a0a0a',
        textareaText: '#ffffff',
        textareaBorder: '1px solid rgba(255, 255, 255, 0.12)',
        deleteText: '#ff7b7b',
        deleteBorder: '1px solid rgba(255, 123, 123, 0.6)',
        cancelText: '#aaaaaa',
        previewBackground: 'rgba(28, 28, 32, 0.98)',
        previewBorder: '1px solid rgba(255, 255, 255, 0.08)',
        previewShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
        previewText: '#ffffff',
        noteDotBorder: '1px solid rgba(46, 10, 10, 0.6)',
        noteDotShadow: '0 3px 8px rgba(0, 0, 0, 0.25)',
        noteDotShadowActive: '0 6px 14px rgba(255, 90, 79, 0.55)',
        accent: '#ff5a4f',
        accentStrong: '#ff453a',
        accentMuted: 'rgba(255, 90, 79, 0.18)',
        accentContrast: '#ffffff',
        noteDotCore: '#ff5a4f',
        noteDotHighlight: '#ffc7c2'
    },
    light: {
        textPrimary: '#1d1d1f',
        textSecondary: 'rgba(29, 29, 31, 0.65)',
        surfaceMuted: 'rgba(29, 29, 31, 0.04)',
        surfaceBorder: '1px solid rgba(29, 29, 31, 0.12)',
        surfaceBaseline: 'rgba(29, 29, 31, 0.15)',
        tooltipBackground: '#ffffff',
        tooltipText: '#1d1d1f',
        tooltipShadow: '0 12px 32px rgba(0, 0, 0, 0.08), 0 0 0 1px rgba(0, 0, 0, 0.04)',
        textareaBackground: '#ffffff',
        textareaText: '#1d1d1f',
        textareaBorder: '1px solid rgba(29, 29, 31, 0.12)',
        deleteText: '#b3261e',
        deleteBorder: '1px solid rgba(179, 38, 30, 0.35)',
        cancelText: 'rgba(29, 29, 31, 0.65)',
        previewBackground: 'rgba(255, 255, 255, 0.98)',
        previewBorder: '1px solid rgba(29, 29, 31, 0.08)',
        previewShadow: '0 10px 28px rgba(29, 29, 31, 0.14)',
        previewText: '#1d1d1f',
        noteDotBorder: '1px solid rgba(201, 42, 42, 0.32)',
        noteDotShadow: '0 3px 8px rgba(29, 29, 31, 0.16)',
        noteDotShadowActive: '0 6px 14px rgba(255, 69, 58, 0.45)',
        accent: '#ff453a',
        accentStrong: '#c92a2a',
        accentMuted: 'rgba(255, 69, 58, 0.12)',
        accentContrast: '#ffffff',
        noteDotCore: '#ff453a',
        noteDotHighlight: '#ffc7c2'
    }
};

const themeState: ThemeState = {
    mode: null,
    palette: themePalettes.dark
};

export { state, themePalettes, themeState, ui };
