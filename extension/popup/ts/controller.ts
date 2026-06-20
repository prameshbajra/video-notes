import {
    DEFAULT_MD_TEMPLATE,
    DELETE_HOLD_ENABLED_STORAGE_KEY,
    ENABLED_STORAGE_KEY,
    FLASHCARDS_ENABLED_STORAGE_KEY,
    GEMINI_API_KEY_STORAGE_KEY,
    MD_EXPORT_ENABLED_STORAGE_KEY,
    MD_TEMPLATE_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    VIEW_NOTES,
    VIEW_SETTINGS,
    ZEN_MODE_STORAGE_KEY
} from './constants.js';
import {
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
    syncZenModeToggle
} from './state.js';
import {
    getNoteDedupKey,
    getObjectOrEmpty,
    isPlainObject,
    mergeMetadataPayload,
    mergeNotesPayload,
    transformStoragePayload
} from './data.js';
import { copyToClipboard } from './clipboard.js';
import { generateMarkdownFromVideo } from './markdown.js';
import { render, type RenderHandlers } from './render.js';
import {
    getStorageSnapshot,
    persistBackupPayload,
    persistDeleteHoldEnabled,
    persistFlashcardsEnabled,
    persistGeminiApiKey,
    persistMdExportEnabled,
    persistMdTemplate,
    persistNewTabFlashcardsEnabled,
    persistNotesEnabled,
    persistZenModeEnabled,
    removeFlashcardsCache,
    removeGeminiApiKey,
    resolveEnabledSetting,
    resolveFlashcardsEnabledSetting,
    resolveNewTabFlashcardsEnabledSetting,
    resolveZenModeSetting
} from './storage.js';
import { getOrGenerateDeck } from './flashcard-deck.js';
import { refreshFlashcardsPanel } from './flashcards.js';

let templateDebounceTimer: number | null = null;

const createBackupPayload = async (): Promise<BackupPayload> => {
    const snapshot = await getStorageSnapshot();
    return {
        notes: getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]),
        metadata: getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]),
        exportedAt: new Date().toISOString()
    };
};

const triggerBackupDownload = (payload: BackupPayload): void => {
    const serialized = JSON.stringify(payload, null, 2);
    const blob = new Blob([serialized], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `video-notes-backup-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
};

const handleExportClick = async (): Promise<void> => {
    try {
        const payload = await createBackupPayload();
        triggerBackupDownload(payload);
        setSettingsMessage('Export ready.', 'success');
    } catch {
        setSettingsMessage('Unable to create export.', 'error');
    }
};

const handleImportButtonClick = (): void => {
    if (!elements.importInput) {
        return;
    }

    elements.importInput.value = '';
    elements.importInput.click();
};

const handleImportFileChange = (event: Event): void => {
    const input = event.target instanceof HTMLInputElement ? event.target : null;
    const file = input && input.files && input.files[0];
    if (!file) {
        return;
    }

    const reader = new FileReader();

    reader.onload = async () => {
        try {
            if (typeof reader.result !== 'string') {
                throw new Error('Invalid data');
            }

            const parsed = JSON.parse(reader.result);
            if (!isPlainObject(parsed)) {
                throw new Error('Invalid backup format');
            }

            const notes = getObjectOrEmpty<NotesIndex>(parsed.notes);
            const metadata = getObjectOrEmpty<MetadataIndex>(parsed.metadata);
            const snapshot = await getStorageSnapshot();
            const existingNotes = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
            const existingMetadata = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
            const mergedNotes = mergeNotesPayload(existingNotes, notes);
            const mergedMetadata = mergeMetadataPayload(existingMetadata, metadata, mergedNotes);

            await persistBackupPayload(mergedNotes, mergedMetadata);
            setSettingsMessage('Backup imported successfully.', 'success');
            loadVideos();
        } catch {
            setSettingsMessage('Import failed. Please use a valid backup file.', 'error');
        } finally {
            input.value = '';
        }
    };

    reader.onerror = () => {
        setSettingsMessage('Unable to read the selected file.', 'error');
        input.value = '';
    };

    reader.readAsText(file);
};

const handleNotesToggleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    const isEnabled = target ? target.checked : true;
    updateNotesEnabled(isEnabled).catch(() => {});
};

const handleZenToggleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    const isEnabled = Boolean(target?.checked);
    updateZenModeEnabled(isEnabled).catch(() => {});
};

const handleMdExportToggleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    const isEnabled = Boolean(target?.checked);
    updateMdExportEnabled(isEnabled).catch(() => {});
};

const handleMdTemplateChange = (event: Event): void => {
    const target = event.target as HTMLTextAreaElement | null;
    const template = target?.value || DEFAULT_MD_TEMPLATE;

    if (templateDebounceTimer !== null) {
        clearTimeout(templateDebounceTimer);
    }

    templateDebounceTimer = window.setTimeout(() => {
        updateMdTemplate(template).catch(() => {});
    }, 500);
};

const handleDeleteHoldToggleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    const isEnabled = Boolean(target?.checked);
    updateDeleteHoldEnabled(isEnabled).catch(() => {});
};

const handleFlashcardsToggleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    const isEnabled = Boolean(target?.checked);
    updateFlashcardsEnabled(isEnabled).catch(() => {});
};

const handleNewTabFlashcardsToggleChange = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    const isEnabled = Boolean(target?.checked);
    updateNewTabFlashcardsEnabled(isEnabled).catch(() => {});
};

const handleFlashcardsKeySaveClick = (): void => {
    const input = elements.flashcardsKeyInput;
    const rawKey = input ? input.value.trim() : '';

    if (!rawKey) {
        setSettingsMessage('Please paste your Gemini API key.', 'error');
        return;
    }

    saveGeminiApiKey(rawKey).catch(() => {});
};

const handleFlashcardsKeyCancelClick = (): void => {
    if (!state.hasGeminiApiKey) {
        updateFlashcardsEnabled(false).catch(() => {});
        return;
    }
    setEnteringGeminiKey(false);
};

const handleFlashcardsKeyClearClick = (): void => {
    clearGeminiApiKey().catch(() => {});
};

const loadNotesEnabledFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const isEnabled = resolveEnabledSetting(snapshot[ENABLED_STORAGE_KEY]);
    syncNotesToggle(isEnabled);
};

const loadZenModeFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const isZenModeEnabled = resolveZenModeSetting(snapshot[ZEN_MODE_STORAGE_KEY]);
    syncZenModeToggle(isZenModeEnabled);
};

const loadMdExportEnabledFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const isMdExportEnabled = resolveEnabledSetting(snapshot[MD_EXPORT_ENABLED_STORAGE_KEY]);
    syncMdExportToggle(isMdExportEnabled);
};

const loadMdTemplateFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const template =
        typeof snapshot[MD_TEMPLATE_STORAGE_KEY] === 'string' && snapshot[MD_TEMPLATE_STORAGE_KEY].trim()
            ? (snapshot[MD_TEMPLATE_STORAGE_KEY] as string)
            : DEFAULT_MD_TEMPLATE;
    syncMdTemplate(template);
};

const loadDeleteHoldEnabledFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const isDeleteHoldEnabled = resolveEnabledSetting(snapshot[DELETE_HOLD_ENABLED_STORAGE_KEY]);
    syncDeleteHoldToggle(isDeleteHoldEnabled);
};

const loadFlashcardsSettingsFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const isEnabled = resolveFlashcardsEnabledSetting(snapshot[FLASHCARDS_ENABLED_STORAGE_KEY]);
    const hasKey = typeof snapshot[GEMINI_API_KEY_STORAGE_KEY] === 'string' &&
        (snapshot[GEMINI_API_KEY_STORAGE_KEY] as string).trim().length > 0;
    syncGeminiApiKeyPresence(hasKey);
    syncFlashcardsToggle(isEnabled);
};

const loadNewTabFlashcardsFromStorage = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const isEnabled = resolveNewTabFlashcardsEnabledSetting(snapshot[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]);
    syncNewTabFlashcardsToggle(isEnabled);
};

const updateNotesEnabled = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isNotesEnabled;
    syncNotesToggle(isEnabled);

    try {
        await persistNotesEnabled(isEnabled);
    } catch {
        syncNotesToggle(previousValue);
        setSettingsMessage('Unable to update video notes setting.', 'error');
    }
};

const updateZenModeEnabled = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isZenModeEnabled;
    syncZenModeToggle(isEnabled);

    try {
        await persistZenModeEnabled(isEnabled);
    } catch {
        syncZenModeToggle(previousValue);
        setSettingsMessage('Unable to update Zen Mode.', 'error');
    }
};

const updateMdExportEnabled = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isMdExportEnabled;
    syncMdExportToggle(isEnabled);

    try {
        await persistMdExportEnabled(isEnabled);
        render(renderHandlers);
    } catch {
        syncMdExportToggle(previousValue);
        setSettingsMessage('Unable to update markdown export setting.', 'error');
    }
};

const updateMdTemplate = async (template: string): Promise<void> => {
    const previousValue = state.mdTemplate;
    syncMdTemplate(template);

    try {
        await persistMdTemplate(template);
    } catch {
        syncMdTemplate(previousValue);
        setSettingsMessage('Unable to update markdown template.', 'error');
    }
};

const updateDeleteHoldEnabled = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isDeleteHoldEnabled;
    syncDeleteHoldToggle(isEnabled);

    try {
        await persistDeleteHoldEnabled(isEnabled);
        render(renderHandlers);
    } catch {
        syncDeleteHoldToggle(previousValue);
        setSettingsMessage('Unable to update delete hold setting.', 'error');
    }
};

const updateFlashcardsEnabled = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isFlashcardsEnabled;
    syncFlashcardsToggle(isEnabled);

    try {
        await persistFlashcardsEnabled(isEnabled);
        if (isEnabled && !state.hasGeminiApiKey) {
            setEnteringGeminiKey(true);
        }
        refreshFlashcardsPanel();
    } catch {
        syncFlashcardsToggle(previousValue);
        setSettingsMessage('Unable to update flashcard setting.', 'error');
    }
};

const updateNewTabFlashcardsEnabled = async (isEnabled: boolean): Promise<void> => {
    const previousValue = state.isNewTabFlashcardsEnabled;
    syncNewTabFlashcardsToggle(isEnabled);

    try {
        await persistNewTabFlashcardsEnabled(isEnabled);
        if (isEnabled) {
            // Warm the deck cache so the first new tab paints instantly. No-ops when
            // the cache is already fresh; failures (no key, <6 notes) are swallowed.
            getOrGenerateDeck().catch(() => {});
        }
    } catch {
        syncNewTabFlashcardsToggle(previousValue);
        setSettingsMessage('Unable to update new tab flashcard setting.', 'error');
    }
};

const saveGeminiApiKey = async (apiKey: string): Promise<void> => {
    try {
        await persistGeminiApiKey(apiKey);
        syncGeminiApiKeyPresence(true);
        setEnteringGeminiKey(false);
        setSettingsMessage('Gemini API key saved.', 'success');
        refreshFlashcardsPanel();
        if (state.isNewTabFlashcardsEnabled) {
            // Warm the deck cache for the new tab now that a key exists.
            getOrGenerateDeck().catch(() => {});
        }
    } catch {
        setSettingsMessage('Unable to save Gemini API key.', 'error');
    }
};

const clearGeminiApiKey = async (): Promise<void> => {
    try {
        await removeGeminiApiKey();
        await removeFlashcardsCache();
        syncGeminiApiKeyPresence(false);
        setSettingsMessage('Gemini API key removed.', 'success');
        refreshFlashcardsPanel();
    } catch {
        setSettingsMessage('Unable to remove Gemini API key.', 'error');
    }
};

const deleteVideoFromStorage = async (videoId: string): Promise<void> => {
    if (!videoId) {
        return;
    }

    const snapshot = await getStorageSnapshot();
    const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
    const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);

    const hasNotes = Object.prototype.hasOwnProperty.call(notesPayload, videoId);
    const hasMetadata = Object.prototype.hasOwnProperty.call(metadataPayload, videoId);
    if (!hasNotes && !hasMetadata) {
        return;
    }

    delete notesPayload[videoId];
    delete metadataPayload[videoId];

    await persistBackupPayload(notesPayload, metadataPayload);
};

const deleteNoteFromStorage = async (videoId: string, noteKey: string): Promise<void> => {
    if (!videoId || !noteKey) {
        return;
    }

    const snapshot = await getStorageSnapshot();
    const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
    const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
    const existingNotes = Array.isArray(notesPayload[videoId]) ? notesPayload[videoId] : [];

    const filteredNotes = existingNotes.filter((note) => getNoteDedupKey(note) !== noteKey);
    if (filteredNotes.length === existingNotes.length) {
        return;
    }

    if (filteredNotes.length === 0) {
        delete notesPayload[videoId];
        delete metadataPayload[videoId];
        await persistBackupPayload(notesPayload, metadataPayload);
        return;
    }

    notesPayload[videoId] = filteredNotes;
    const existingMetadata = isPlainObject(metadataPayload[videoId]) ? metadataPayload[videoId] : {};
    metadataPayload[videoId] = {
        ...existingMetadata,
        noteCount: filteredNotes.length,
        updatedAt: Date.now()
    };

    await persistBackupPayload(notesPayload, metadataPayload);
};

const handleVideoDelete = async (videoId: string): Promise<void> => {
    if (!videoId) {
        return;
    }

    try {
        await deleteVideoFromStorage(videoId);
        state.expandedVideos.delete(videoId);
        await loadVideos();
    } catch {
        setSettingsMessage('Unable to delete video notes', 'error');
    }
};

const handleNoteDelete = async (videoId: string, noteKey: string): Promise<void> => {
    if (!videoId || !noteKey) {
        return;
    }

    try {
        await deleteNoteFromStorage(videoId, noteKey);
        state.expandedVideos.add(videoId);
        await loadVideos();
    } catch {
        setSettingsMessage('Unable to delete note', 'error');
    }
};

const toggleVideoExpansion = (videoId: string): void => {
    if (!videoId) {
        return;
    }

    if (state.expandedVideos.has(videoId)) {
        state.expandedVideos.delete(videoId);
    } else {
        state.expandedVideos.add(videoId);
    }

    render(renderHandlers);
};

const openNote = (videoId: string, timestampSeconds: number | string): void => {
    if (!videoId) {
        return;
    }

    const seconds = Math.max(0, Math.floor(Number(timestampSeconds)));
    const targetUrl = new URL('https://www.youtube.com/watch');
    targetUrl.searchParams.set('v', videoId);
    if (seconds > 0) {
        targetUrl.searchParams.set('t', seconds.toString());
    }

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl.toString() }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                setSettingsMessage('Unable to open video', 'error');
                return;
            }
            if (shouldCloseOnNavigate) {
                window.close();
            }
        });
        return;
    }

    window.open(targetUrl.toString(), '_blank', 'noopener');
    if (shouldCloseOnNavigate) {
        window.close();
    }
};

const openNotesPage = (): void => {
    const targetUrl =
        typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
            ? chrome.runtime.getURL('notes/notes.html')
            : 'notes/notes.html';

    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url: targetUrl }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                setSettingsMessage('Unable to open notes page', 'error');
                return;
            }
            if (shouldCloseOnNavigate) {
                window.close();
            }
        });
        return;
    }

    window.open(targetUrl, '_blank', 'noopener');
    if (shouldCloseOnNavigate) {
        window.close();
    }
};

const exportVideoAsMarkdown = async (video: VideoListItem): Promise<void> => {
    try {
        const template = state.mdTemplate || DEFAULT_MD_TEMPLATE;
        const markdown = generateMarkdownFromVideo(video, template);
        await copyToClipboard(markdown);
        showToast('Markdown copied to clipboard!', 'success');
    } catch {
        showToast('Unable to copy markdown.', 'error');
    }
};

const shareVideoNotes = async (video: VideoListItem): Promise<void> => {
    try {
        const payload = {
            videoId: video.videoId,
            title: video.title,
            notes: video.notes.map((n) => ({
                timestamp: n.timestamp,
                text: n.text
            }))
        };

        const data = await new Promise<{ url: string }>((resolve, reject) => {
            chrome.runtime.sendMessage(
                { type: 'SHARE_NOTES', payload },
                (response: { success: boolean; url?: string; error?: string } | undefined) => {
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message || 'Message failed'));
                        return;
                    }
                    if (!response || !response.success) {
                        reject(new Error(response?.error || 'Share failed'));
                        return;
                    }
                    resolve({ url: response.url || '' });
                }
            );
        });

        await copyToClipboard(data.url);
        state.sharedUrls.set(video.videoId, data.url);
        showToast('Share link copied to clipboard!', 'success');
        render(renderHandlers);
    } catch {
        showToast('Failed to create share link. Please try again.', 'error');
    }
};

const handleSearchInput = (event: Event): void => {
    const target = event.target as HTMLInputElement | null;
    state.searchTerm = target?.value || '';
    render(renderHandlers);
};

const loadVideos = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
    const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
    const videos = transformStoragePayload(notesPayload, metadataPayload);
    const existingIds = new Set(videos.map((video) => video.videoId));
    state.expandedVideos = new Set([...state.expandedVideos].filter((videoId) => existingIds.has(videoId)));

    if (state.expandedVideos.size === 0 && videos.length === 1 && videos[0]?.videoId) {
        state.expandedVideos.add(videos[0].videoId);
    }

    state.videos = videos;
    render(renderHandlers);
};

const storageChangeHandler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
    if (areaName !== 'local') {
        return;
    }

    if (changes[ENABLED_STORAGE_KEY]) {
        const nextEnabled = resolveEnabledSetting(changes[ENABLED_STORAGE_KEY].newValue);
        syncNotesToggle(nextEnabled);
    }

    if (changes[ZEN_MODE_STORAGE_KEY]) {
        const nextZenMode = resolveZenModeSetting(changes[ZEN_MODE_STORAGE_KEY].newValue);
        syncZenModeToggle(nextZenMode);
    }

    if (changes[MD_EXPORT_ENABLED_STORAGE_KEY]) {
        const nextMdExportEnabled = resolveEnabledSetting(changes[MD_EXPORT_ENABLED_STORAGE_KEY].newValue);
        syncMdExportToggle(nextMdExportEnabled);
        render(renderHandlers);
    }

    if (changes[MD_TEMPLATE_STORAGE_KEY]) {
        const nextTemplate =
            typeof changes[MD_TEMPLATE_STORAGE_KEY].newValue === 'string' &&
            changes[MD_TEMPLATE_STORAGE_KEY].newValue.trim()
                ? (changes[MD_TEMPLATE_STORAGE_KEY].newValue as string)
                : DEFAULT_MD_TEMPLATE;
        syncMdTemplate(nextTemplate);
    }

    if (changes[DELETE_HOLD_ENABLED_STORAGE_KEY]) {
        const nextDeleteHoldEnabled = resolveEnabledSetting(changes[DELETE_HOLD_ENABLED_STORAGE_KEY].newValue);
        syncDeleteHoldToggle(nextDeleteHoldEnabled);
        render(renderHandlers);
    }

    if (changes[NOTES_STORAGE_KEY] || changes[METADATA_STORAGE_KEY]) {
        loadVideos();
    }

    if (changes[FLASHCARDS_ENABLED_STORAGE_KEY]) {
        const nextEnabled = resolveFlashcardsEnabledSetting(changes[FLASHCARDS_ENABLED_STORAGE_KEY].newValue);
        syncFlashcardsToggle(nextEnabled);
        refreshFlashcardsPanel();
    }

    if (changes[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]) {
        const nextEnabled = resolveNewTabFlashcardsEnabledSetting(changes[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY].newValue);
        syncNewTabFlashcardsToggle(nextEnabled);
    }

    if (changes[GEMINI_API_KEY_STORAGE_KEY]) {
        const newValue = changes[GEMINI_API_KEY_STORAGE_KEY].newValue;
        const hasKey = typeof newValue === 'string' && newValue.trim().length > 0;
        syncGeminiApiKeyPresence(hasKey);
        refreshFlashcardsPanel();
    }
};

const renderHandlers: RenderHandlers = {
    onDeleteNote: (videoId: string, noteKey: string): void => {
        handleNoteDelete(videoId, noteKey).catch(() => {});
    },
    onDeleteVideo: (videoId: string): void => {
        handleVideoDelete(videoId).catch(() => {});
    },
    onExportVideo: (video: VideoListItem): void => {
        exportVideoAsMarkdown(video).catch(() => {});
    },
    onShareVideo: (video: VideoListItem): void => {
        shareVideoNotes(video).catch(() => { });
    },
    onOpenNote: (videoId: string, timestampSeconds: number | string): void => {
        openNote(videoId, timestampSeconds);
    },
    onToggleVideo: (videoId: string): void => {
        toggleVideoExpansion(videoId);
    }
};

const initialize = (): void => {
    syncViewVisibility();
    loadNotesEnabledFromStorage().catch(() => {
        syncNotesToggle(true);
    });
    loadZenModeFromStorage().catch(() => {
        syncZenModeToggle(false);
    });
    loadMdExportEnabledFromStorage().catch(() => {
        syncMdExportToggle(false);
    });
    loadMdTemplateFromStorage().catch(() => {
        syncMdTemplate(DEFAULT_MD_TEMPLATE);
    });
    loadDeleteHoldEnabledFromStorage().catch(() => {
        syncDeleteHoldToggle(true);
    });
    loadFlashcardsSettingsFromStorage()
        .then(() => refreshFlashcardsPanel())
        .catch(() => {
            syncFlashcardsToggle(false);
            syncGeminiApiKeyPresence(false);
        });
    loadNewTabFlashcardsFromStorage().catch(() => {
        syncNewTabFlashcardsToggle(false);
    });

    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', handleSearchInput);
    }

    if (elements.openPageButton) {
        elements.openPageButton.addEventListener('click', openNotesPage);
    }

    if (elements.settingsButton) {
        elements.settingsButton.addEventListener('click', () => setActiveView(VIEW_SETTINGS));
    }

    if (elements.backButton) {
        elements.backButton.addEventListener('click', () => setActiveView(VIEW_NOTES));
    }

    if (elements.exportButton) {
        elements.exportButton.addEventListener('click', handleExportClick);
    }

    if (elements.importButton) {
        elements.importButton.addEventListener('click', handleImportButtonClick);
    }

    if (elements.importInput) {
        elements.importInput.addEventListener('change', handleImportFileChange);
    }

    if (elements.enableToggle) {
        elements.enableToggle.addEventListener('change', handleNotesToggleChange);
    }

    if (elements.zenModeToggle) {
        elements.zenModeToggle.addEventListener('change', handleZenToggleChange);
    }

    if (elements.mdExportToggle) {
        elements.mdExportToggle.addEventListener('change', handleMdExportToggleChange);
    }

    if (elements.mdTemplateTextarea) {
        elements.mdTemplateTextarea.addEventListener('input', handleMdTemplateChange);
    }

    if (elements.deleteHoldToggle) {
        elements.deleteHoldToggle.addEventListener('change', handleDeleteHoldToggleChange);
    }

    if (elements.flashcardsToggle) {
        elements.flashcardsToggle.addEventListener('change', handleFlashcardsToggleChange);
    }

    if (elements.newTabFlashcardsToggle) {
        elements.newTabFlashcardsToggle.addEventListener('change', handleNewTabFlashcardsToggleChange);
    }

    if (elements.flashcardsKeySaveButton) {
        elements.flashcardsKeySaveButton.addEventListener('click', handleFlashcardsKeySaveClick);
    }

    if (elements.flashcardsKeyCancelButton) {
        elements.flashcardsKeyCancelButton.addEventListener('click', handleFlashcardsKeyCancelClick);
    }

    if (elements.flashcardsKeyClearButton) {
        elements.flashcardsKeyClearButton.addEventListener('click', handleFlashcardsKeyClearClick);
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(storageChangeHandler);
        window.addEventListener('pagehide', () => {
            chrome.storage.onChanged.removeListener(storageChangeHandler);
            if (templateDebounceTimer !== null) {
                clearTimeout(templateDebounceTimer);
                templateDebounceTimer = null;
            }
        });
    }

    loadVideos().catch(() => {
        state.videos = [];
        render(renderHandlers);
    });
};

export { initialize };
