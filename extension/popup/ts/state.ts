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
    isDeleteHoldEnabled: true
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
    deleteHoldToggle: document.getElementById('delete-hold-toggle') as HTMLInputElement | null
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

export {
    elements,
    setActiveView,
    setSettingsMessage,
    shouldCloseOnNavigate,
    state,
    syncDeleteHoldToggle,
    syncMdExportToggle,
    syncMdTemplate,
    syncNotesToggle,
    syncViewVisibility,
    syncZenModeToggle,
    viewContext
};
