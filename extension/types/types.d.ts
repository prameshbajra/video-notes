interface Note {
    id: string;
    timestamp: number;
    text: string;
    createdAt: number;
    updatedAt: number;
}

interface StoredNote extends Partial<Note> {
    [key: string]: unknown;
}

interface NormalizedNote {
    id: string;
    text: string;
    textLower: string;
    timestamp: number;
    formattedTimestamp: string;
    updatedAt: number;
    dedupKey: string;
}

type NotesIndex<T extends StoredNote = StoredNote> = Record<string, T[]>;

interface MetadataEntry {
    title?: string;
    noteCount?: number;
    updatedAt?: number;
    [key: string]: unknown;
}

type MetadataIndex = Record<string, MetadataEntry>;

type ThemeMode = 'dark' | 'light';

interface ParsedColor {
    r: number;
    g: number;
    b: number;
    a: number;
}

interface ThemePalette {
    textPrimary: string;
    textSecondary: string;
    surfaceMuted: string;
    surfaceBorder: string;
    surfaceBaseline: string;
    tooltipBackground: string;
    tooltipText: string;
    tooltipShadow: string;
    textareaBackground: string;
    textareaText: string;
    textareaBorder: string;
    deleteText: string;
    deleteBorder: string;
    cancelText: string;
    previewBackground: string;
    previewBorder: string;
    previewShadow: string;
    previewText: string;
    noteDotBorder: string;
    noteDotShadow: string;
    noteDotShadowActive: string;
    accent: string;
    accentStrong: string;
    accentMuted: string;
    accentContrast: string;
    noteDotCore: string;
    noteDotHighlight: string;
}

interface ThemeState {
    mode: ThemeMode | null;
    palette: ThemePalette;
}

type TooltipMode = 'create' | 'edit' | null;

interface UiElements {
    container: HTMLDivElement | null;
    addButton: HTMLButtonElement | null;
    zenButton: HTMLButtonElement | null;
    shareButton: HTMLButtonElement | null;
    track: HTMLDivElement | null;
    trackBaseline: HTMLDivElement | null;
    tooltip: HTMLDivElement | null;
    textarea: HTMLTextAreaElement | null;
    cancelButton: HTMLButtonElement | null;
    saveButton: HTMLButtonElement | null;
    deleteButton: HTMLButtonElement | null;
    heading: HTMLSpanElement | null;
    timestampLabel: HTMLSpanElement | null;
    emptyState: HTMLSpanElement | null;
    previewTooltip: HTMLDivElement | null;
    previewText: HTMLDivElement | null;
    trackHoverTooltip: HTMLDivElement | null;
}

interface ExtensionState {
    video: HTMLVideoElement | null;
    videoId: string | null;
    notes: Note[];
    tooltipMode: TooltipMode;
    activeNoteId: string | null;
    pendingTimestamp: number | null;
    tooltipAnchor: HTMLElement | null;
    previewAnchor: HTMLElement | null;
    previewNoteId: string | null;
    resumePlaybackVideo: HTMLVideoElement | null;
    isEnabled: boolean;
    isZenModeEnabled: boolean;
}

type ViewName = 'notes' | 'settings';

interface VideoListItem {
    videoId: string;
    title: string;
    titleLower: string;
    noteCount: number;
    updatedAt: number;
    notes: NormalizedNote[];
}

interface BackupPayload {
    notes: NotesIndex;
    metadata: MetadataIndex;
    exportedAt: string;
}

type StorageSnapshot = Record<string, unknown>;

interface FlashcardSource {
    videoId: string;
    videoTitle: string;
    timestamp: number;
    noteText: string;
}

interface Flashcard {
    question: string;
    correctAnswer: string;
    wrongAnswers: string[];
    source: FlashcardSource;
}

interface FlashcardsCache {
    deck: Flashcard[];
    generatedAt: number;
    noteIdsHash: string;
}

type FlashcardStatus = 'disabled' | 'ready' | 'loading' | 'playing' | 'complete' | 'error' | 'insufficient-notes';

interface FlashcardGameState {
    status: FlashcardStatus;
    deck: Flashcard[];
    currentIndex: number;
    score: number;
    answeredIds: Set<number>;
    lastAnswer: { index: number; correct: boolean; selected: string } | null;
    errorMessage: string | null;
}

interface PopupState {
    videos: VideoListItem[];
    expandedVideos: Set<string>;
    searchTerm: string;
    activeView: ViewName;
    isNotesEnabled: boolean;
    isZenModeEnabled: boolean;
    isMdExportEnabled: boolean;
    mdTemplate: string;
    isDeleteHoldEnabled: boolean;
    sharedUrls: Map<string, string>;
    isFlashcardsEnabled: boolean;
    hasGeminiApiKey: boolean;
    isEnteringGeminiKey: boolean;
}

interface PopupElements {
    searchInput: HTMLInputElement | null;
    videoList: HTMLUListElement | null;
    emptyState: HTMLDivElement | null;
    notesView: HTMLDivElement | null;
    settingsView: HTMLDivElement | null;
    openPageButton: HTMLButtonElement | null;
    settingsButton: HTMLButtonElement | null;
    backButton: HTMLButtonElement | null;
    exportButton: HTMLButtonElement | null;
    importButton: HTMLButtonElement | null;
    importInput: HTMLInputElement | null;
    settingsMessage: HTMLParagraphElement | null;
    enableToggle: HTMLInputElement | null;
    zenModeToggle: HTMLInputElement | null;
    mdExportToggle: HTMLInputElement | null;
    mdTemplateTextarea: HTMLTextAreaElement | null;
    deleteHoldToggle: HTMLInputElement | null;
    flashcardsToggle: HTMLInputElement | null;
    flashcardsKeySection: HTMLDivElement | null;
    flashcardsKeyPrompt: HTMLDivElement | null;
    flashcardsKeyStatus: HTMLDivElement | null;
    flashcardsKeyInput: HTMLInputElement | null;
    flashcardsKeySaveButton: HTMLButtonElement | null;
    flashcardsKeyCancelButton: HTMLButtonElement | null;
    flashcardsKeyClearButton: HTMLButtonElement | null;
    flashcardsPanel: HTMLDivElement | null;
}
