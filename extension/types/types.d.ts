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
}

interface ThemeState {
    mode: ThemeMode | null;
    palette: ThemePalette;
}

type TooltipMode = 'create' | 'edit' | null;

interface UiElements {
    container: HTMLDivElement | null;
    addButton: HTMLButtonElement | null;
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

interface PopupState {
    videos: VideoListItem[];
    expandedVideos: Set<string>;
    searchTerm: string;
    activeView: ViewName;
    isNotesEnabled: boolean;
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
}
