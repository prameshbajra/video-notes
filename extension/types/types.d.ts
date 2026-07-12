interface Note {
    id: string;
    timestamp: number;
    text: string;
    createdAt: number;
    updatedAt: number;
    annotation?: NoteAnnotation;
}

interface StoredNote extends Partial<Note> {
    [key: string]: unknown;
}

interface NoteAnnotationImage {
    dataUrl: string;
    width: number;
    height: number;
    generatedAt: number;
}

interface NoteAnnotationViewport {
    width: number;
    height: number;
}

interface NoteAnnotation {
    version: 1;
    scene: Record<string, unknown>;
    image: NoteAnnotationImage;
    viewport: NoteAnnotationViewport;
}

interface AnnotationEditorHost {
    state: ExtensionState;
    ui: UiElements;
    getPalette: () => ThemePalette;
    onDone: () => void;
    onCancel: () => void;
    onDelete: () => void;
}

interface AnnotationEditorApi {
    open(annotation: NoteAnnotation | null): boolean;
    close(): void;
    isActive(): boolean;
    isTarget(target: EventTarget | null): boolean;
    resize(): void;
    hasContent(): boolean;
    getCurrentAnnotation(): NoteAnnotation | null | undefined;
    showError(message: string): void;
}

interface SharedNoteAnnotation {
    version: 1;
    image: NoteAnnotationImage;
    viewport: NoteAnnotationViewport;
}

interface NormalizedNote {
    id: string;
    text: string;
    displayText: string;
    textLower: string;
    timestamp: number;
    formattedTimestamp: string;
    updatedAt: number;
    dedupKey: string;
    annotation?: SharedNoteAnnotation;
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
type CaptureKind = 'text' | 'annotation' | null;

interface UiElements {
    container: HTMLDivElement | null;
    addButton: HTMLButtonElement | null;
    annotateButton: HTMLButtonElement | null;
    zenButton: HTMLButtonElement | null;
    shareButton: HTMLButtonElement | null;
    track: HTMLDivElement | null;
    trackBaseline: HTMLDivElement | null;
    tooltip: HTMLDivElement | null;
    textarea: HTMLTextAreaElement | null;
    cancelButton: HTMLButtonElement | null;
    saveButton: HTMLButtonElement | null;
    deleteButton: HTMLButtonElement | null;
    annotationActionButton: HTMLButtonElement | null;
    errorMessage: HTMLParagraphElement | null;
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
    captureKind: CaptureKind;
    activeNoteId: string | null;
    pendingTimestamp: number | null;
    tooltipAnchor: HTMLElement | null;
    previewAnchor: HTMLElement | null;
    previewNoteId: string | null;
    resumePlaybackVideo: HTMLVideoElement | null;
    isEnabled: boolean;
    isZenModeEnabled: boolean;
    isAnnotationsEnabled: boolean;
    captureSessionId: number;
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
    visibleVideoLimit: number;
    visibleNotesByVideo: Map<string, number>;
    activeView: ViewName;
    isNotesEnabled: boolean;
    isZenModeEnabled: boolean;
    isAnnotationsEnabled: boolean;
    isMdExportEnabled: boolean;
    mdTemplate: string;
    isDeleteHoldEnabled: boolean;
    sharedUrls: Map<string, string>;
    isFlashcardsEnabled: boolean;
    isNewTabFlashcardsEnabled: boolean;
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
    annotationsToggle: HTMLInputElement | null;
    mdExportToggle: HTMLInputElement | null;
    mdTemplateTextarea: HTMLTextAreaElement | null;
    deleteHoldToggle: HTMLInputElement | null;
    flashcardsToggle: HTMLInputElement | null;
    newTabFlashcardsToggle: HTMLInputElement | null;
    flashcardsKeySection: HTMLDivElement | null;
    flashcardsKeyPrompt: HTMLDivElement | null;
    flashcardsKeyStatus: HTMLDivElement | null;
    flashcardsKeyInput: HTMLInputElement | null;
    flashcardsKeySaveButton: HTMLButtonElement | null;
    flashcardsKeyCancelButton: HTMLButtonElement | null;
    flashcardsKeyClearButton: HTMLButtonElement | null;
    flashcardsPanel: HTMLDivElement | null;
}
