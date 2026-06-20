import {
    DEFAULT_MD_TEMPLATE,
    SETTINGS_MESSAGE_STATES,
    VIEW_CONTEXT_PAGE,
    VIEW_NOTES,
    VIEW_SETTINGS
} from './constants.js';

const viewContext: 'popup' | 'page' =
    document.body.dataset.viewContext === VIEW_CONTEXT_PAGE ? VIEW_CONTEXT_PAGE : 'popup';
const shouldCloseOnNavigate = viewContext === 'popup';

const state: PopupState = {
    videos: [],
    expandedVideos: new Set<string>(),
    searchTerm: '',
    activeView: VIEW_NOTES,
    isNotesEnabled: true,
    isZenModeEnabled: false,
    isMdExportEnabled: false,
    mdTemplate: DEFAULT_MD_TEMPLATE,
    isDeleteHoldEnabled: true,
    sharedUrls: new Map<string, string>(),
    isFlashcardsEnabled: false,
    isNewTabFlashcardsEnabled: false,
    hasGeminiApiKey: false,
    isEnteringGeminiKey: false
};

const elements: PopupElements = {
    searchInput: document.getElementById('search-input') as HTMLInputElement | null,
    videoList: document.getElementById('video-list') as HTMLUListElement | null,
    emptyState: document.getElementById('empty-state') as HTMLDivElement | null,
    notesView: document.getElementById('notes-view') as HTMLDivElement | null,
    settingsView: document.getElementById('settings-view') as HTMLDivElement | null,
    openPageButton: document.getElementById('open-page-button') as HTMLButtonElement | null,
    settingsButton: document.getElementById('settings-button') as HTMLButtonElement | null,
    backButton: document.getElementById('back-button') as HTMLButtonElement | null,
    exportButton: document.getElementById('export-button') as HTMLButtonElement | null,
    importButton: document.getElementById('import-button') as HTMLButtonElement | null,
    importInput: document.getElementById('import-input') as HTMLInputElement | null,
    settingsMessage: document.getElementById('settings-message') as HTMLParagraphElement | null,
    enableToggle: document.getElementById('enable-notes-toggle') as HTMLInputElement | null,
    zenModeToggle: document.getElementById('zen-mode-toggle') as HTMLInputElement | null,
    mdExportToggle: document.getElementById('md-export-toggle') as HTMLInputElement | null,
    mdTemplateTextarea: document.getElementById('md-template-textarea') as HTMLTextAreaElement | null,
    deleteHoldToggle: document.getElementById('delete-hold-toggle') as HTMLInputElement | null,
    flashcardsToggle: document.getElementById('flashcards-toggle') as HTMLInputElement | null,
    newTabFlashcardsToggle: document.getElementById('newtab-flashcards-toggle') as HTMLInputElement | null,
    flashcardsKeySection: document.getElementById('flashcards-key-section') as HTMLDivElement | null,
    flashcardsKeyPrompt: document.getElementById('flashcards-key-prompt') as HTMLDivElement | null,
    flashcardsKeyStatus: document.getElementById('flashcards-key-status') as HTMLDivElement | null,
    flashcardsKeyInput: document.getElementById('flashcards-key-input') as HTMLInputElement | null,
    flashcardsKeySaveButton: document.getElementById('flashcards-key-save') as HTMLButtonElement | null,
    flashcardsKeyCancelButton: document.getElementById('flashcards-key-cancel') as HTMLButtonElement | null,
    flashcardsKeyClearButton: document.getElementById('flashcards-key-clear') as HTMLButtonElement | null,
    flashcardsPanel: document.getElementById('flashcards-panel') as HTMLDivElement | null
};

const syncNotesToggle = (isEnabled: boolean): void => {
    state.isNotesEnabled = isEnabled;
    if (elements.enableToggle) {
        elements.enableToggle.checked = isEnabled;
    }
};

const syncZenModeToggle = (isEnabled: boolean): void => {
    state.isZenModeEnabled = isEnabled;
    if (elements.zenModeToggle) {
        elements.zenModeToggle.checked = isEnabled;
    }
};

const syncMdExportToggle = (isEnabled: boolean): void => {
    state.isMdExportEnabled = isEnabled;
    if (elements.mdExportToggle) {
        elements.mdExportToggle.checked = isEnabled;
    }
};

const syncMdTemplate = (template: string): void => {
    state.mdTemplate = template;
    if (elements.mdTemplateTextarea) {
        elements.mdTemplateTextarea.value = template;
    }
};

const syncDeleteHoldToggle = (isEnabled: boolean): void => {
    state.isDeleteHoldEnabled = isEnabled;
    if (elements.deleteHoldToggle) {
        elements.deleteHoldToggle.checked = isEnabled;
    }
};

const syncFlashcardsSettingsUi = (): void => {
    if (elements.flashcardsToggle) {
        elements.flashcardsToggle.checked = state.isFlashcardsEnabled;
    }

    const section = elements.flashcardsKeySection;
    const prompt = elements.flashcardsKeyPrompt;
    const status = elements.flashcardsKeyStatus;

    if (!section || !prompt || !status) {
        return;
    }

    const needsGeminiKey = state.isFlashcardsEnabled || state.isNewTabFlashcardsEnabled;
    const showSection = needsGeminiKey || state.isEnteringGeminiKey;
    section.hidden = !showSection;

    const showPrompt = state.isEnteringGeminiKey || (needsGeminiKey && !state.hasGeminiApiKey);
    prompt.hidden = !showPrompt;
    status.hidden = !(needsGeminiKey && state.hasGeminiApiKey && !state.isEnteringGeminiKey);

    if (!showPrompt && elements.flashcardsKeyInput) {
        elements.flashcardsKeyInput.value = '';
    }
};

const syncFlashcardsToggle = (isEnabled: boolean): void => {
    state.isFlashcardsEnabled = isEnabled;
    if (!isEnabled && !state.isNewTabFlashcardsEnabled) {
        state.isEnteringGeminiKey = false;
    }
    syncFlashcardsSettingsUi();
};

const syncNewTabFlashcardsToggle = (isEnabled: boolean): void => {
    state.isNewTabFlashcardsEnabled = isEnabled;
    if (!isEnabled && !state.isFlashcardsEnabled) {
        state.isEnteringGeminiKey = false;
    }
    if (elements.newTabFlashcardsToggle) {
        elements.newTabFlashcardsToggle.checked = isEnabled;
    }
    syncFlashcardsSettingsUi();
};

const syncGeminiApiKeyPresence = (hasKey: boolean): void => {
    state.hasGeminiApiKey = hasKey;
    if (hasKey) {
        state.isEnteringGeminiKey = false;
    }
    syncFlashcardsSettingsUi();
};

const setEnteringGeminiKey = (isEntering: boolean): void => {
    state.isEnteringGeminiKey = isEntering;
    syncFlashcardsSettingsUi();
    if (isEntering && elements.flashcardsKeyInput) {
        elements.flashcardsKeyInput.focus();
    }
};

const syncViewVisibility = (): void => {
    const isNotesView = state.activeView === VIEW_NOTES;

    if (elements.notesView) {
        elements.notesView.classList.toggle('view--active', isNotesView);
    }

    if (elements.settingsView) {
        elements.settingsView.classList.toggle('view--active', !isNotesView);
    }

    if (elements.searchInput) {
        elements.searchInput.hidden = !isNotesView;
    }
};

const setActiveView = (view: ViewName): void => {
    if (view !== VIEW_NOTES && view !== VIEW_SETTINGS) {
        return;
    }

    if (state.activeView === view) {
        return;
    }

    state.activeView = view;
    syncViewVisibility();
};

const setSettingsMessage = (message: string, variant?: 'success' | 'error'): void => {
    const messageElement = elements.settingsMessage;
    if (!messageElement) {
        return;
    }

    messageElement.textContent = message || '';
    SETTINGS_MESSAGE_STATES.forEach((className) => {
        messageElement.classList.remove(className);
    });

    if (!variant) {
        return;
    }

    const className = variant === 'success' ? 'settings-message--success' : 'settings-message--error';
    messageElement.classList.add(className);
};

let activeToastTimer: number | null = null;

const showToast = (message: string, variant: 'success' | 'error' = 'success'): void => {
    if (activeToastTimer !== null) {
        clearTimeout(activeToastTimer);
        activeToastTimer = null;
    }

    let toast = document.getElementById('popup-toast') as HTMLDivElement | null;
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'popup-toast';
        toast.className = 'toast';
        toast.setAttribute('role', 'status');
        toast.setAttribute('aria-live', 'polite');
        document.body.appendChild(toast);
    }

    toast.textContent = message;
    toast.classList.remove('toast--success', 'toast--error', 'toast--visible');
    toast.classList.add(variant === 'success' ? 'toast--success' : 'toast--error');

    void toast.offsetWidth;
    toast.classList.add('toast--visible');

    activeToastTimer = window.setTimeout(() => {
        toast!.classList.remove('toast--visible');
        activeToastTimer = null;
    }, 3000);
};

export {
    elements,
    setActiveView,
    setEnteringGeminiKey,
    setSettingsMessage,
    shouldCloseOnNavigate,
    showToast,
    state,
    syncDeleteHoldToggle,
    syncFlashcardsToggle,
    syncGeminiApiKeyPresence,
    syncMdExportToggle,
    syncMdTemplate,
    syncNewTabFlashcardsToggle,
    syncNotesToggle,
    syncViewVisibility,
    syncZenModeToggle,
    viewContext
};
