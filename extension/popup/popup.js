const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const VIEW_NOTES = 'notes';
const VIEW_SETTINGS = 'settings';

const state = {
    videos: [],
    expandedVideos: new Set(),
    searchTerm: '',
    activeView: VIEW_NOTES
};

const elements = {
    searchInput: document.getElementById('search-input'),
    videoList: document.getElementById('video-list'),
    emptyState: document.getElementById('empty-state'),
    notesView: document.getElementById('notes-view'),
    settingsView: document.getElementById('settings-view'),
    settingsButton: document.getElementById('settings-button'),
    backButton: document.getElementById('back-button'),
    exportButton: document.getElementById('export-button'),
    importButton: document.getElementById('import-button'),
    importInput: document.getElementById('import-input'),
    importInput: document.getElementById('import-input'),
    settingsMessage: document.getElementById('settings-message'),
    zenModeToggle: document.getElementById('zen-mode-toggle')
};

const SETTINGS_MESSAGE_STATES = ['settings-message--success', 'settings-message--error'];

const isPlainObject = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getObjectOrEmpty = (value) => (isPlainObject(value) ? value : {});

const syncViewVisibility = () => {
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

const setActiveView = (view) => {
    if (view !== VIEW_NOTES && view !== VIEW_SETTINGS) {
        return;
    }

    if (state.activeView === view) {
        return;
    }

    state.activeView = view;
    syncViewVisibility();
};

const setSettingsMessage = (message, variant) => {
    if (!elements.settingsMessage) {
        return;
    }

    elements.settingsMessage.textContent = message || '';
    SETTINGS_MESSAGE_STATES.forEach((className) => {
        elements.settingsMessage.classList.remove(className);
    });

    if (!variant) {
        return;
    }

    const className = variant === 'success' ? 'settings-message--success' : 'settings-message--error';
    elements.settingsMessage.classList.add(className);
};

const createBackupPayload = async () => {
    const snapshot = await getStorageSnapshot();
    return {
        notes: getObjectOrEmpty(snapshot[NOTES_STORAGE_KEY]),
        metadata: getObjectOrEmpty(snapshot[METADATA_STORAGE_KEY]),
        exportedAt: new Date().toISOString()
    };
};

const triggerBackupDownload = (payload) => {
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

const handleExportClick = async () => {
    try {
        const payload = await createBackupPayload();
        triggerBackupDownload(payload);
        setSettingsMessage('Export ready.', 'success');
    } catch (error) {
        setSettingsMessage('Unable to create export.', 'error');
    }
};

const persistBackupPayload = (notes, metadata) =>
    new Promise((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set(
            {
                [NOTES_STORAGE_KEY]: notes,
                [METADATA_STORAGE_KEY]: metadata
            },
            () => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message));
                    return;
                }
                resolve();
            }
        );
    });

const getNoteDedupKey = (note) => {
    if (!isPlainObject(note)) {
        return null;
    }

    if (typeof note.id === 'string') {
        const trimmed = note.id.trim();
        if (trimmed) {
            return `id:${trimmed}`;
        }
    }

    const timestamp = Number(note.timestamp);
    const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : null;
    const text = typeof note.text === 'string' ? note.text.trim().toLowerCase() : '';

    if (normalizedTimestamp === null && !text) {
        return null;
    }

    return `fallback:${normalizedTimestamp !== null ? normalizedTimestamp : 'na'}:${text}`;
};

const mergeNotesPayload = (existingNotes, importedNotes) => {
    const merged = { ...existingNotes };

    Object.entries(importedNotes).forEach(([videoId, rawNotes]) => {
        if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
            return;
        }

        const sanitizedNotes = rawNotes.filter((note) => isPlainObject(note));
        if (sanitizedNotes.length === 0) {
            return;
        }

        const currentNotes = Array.isArray(merged[videoId]) ? merged[videoId] : [];
        const combined = currentNotes.slice();
        const seenKeys = new Set(currentNotes.map((note) => getNoteDedupKey(note)).filter(Boolean));

        sanitizedNotes.forEach((note) => {
            const key = getNoteDedupKey(note);
            if (!key || seenKeys.has(key)) {
                return;
            }
            seenKeys.add(key);
            combined.push(note);
        });

        merged[videoId] = combined;
    });

    return merged;
};

const mergeMetadataPayload = (existingMetadata, importedMetadata, mergedNotes) => {
    const merged = {};

    Object.entries(existingMetadata).forEach(([videoId, metadata]) => {
        if (isPlainObject(metadata)) {
            merged[videoId] = { ...metadata };
        }
    });

    Object.entries(importedMetadata).forEach(([videoId, metadata]) => {
        if (!isPlainObject(metadata)) {
            return;
        }

        if (!merged[videoId]) {
            merged[videoId] = { ...metadata };
            return;
        }

        const currentUpdatedAt = Number(merged[videoId].updatedAt);
        const candidateUpdatedAt = Number(metadata.updatedAt);
        const useImported =
            Number.isFinite(candidateUpdatedAt) && (!Number.isFinite(currentUpdatedAt) || candidateUpdatedAt > currentUpdatedAt);

        if (useImported) {
            merged[videoId] = { ...merged[videoId], ...metadata };
        }
    });

    Object.entries(mergedNotes).forEach(([videoId, notes]) => {
        if (!Array.isArray(notes) || notes.length === 0) {
            return;
        }

        const base = merged[videoId] ? { ...merged[videoId] } : {};
        base.noteCount = notes.length;
        merged[videoId] = base;
    });

    return merged;
};

const handleImportButtonClick = () => {
    if (!elements.importInput) {
        return;
    }

    elements.importInput.value = '';
    elements.importInput.click();
};

const handleImportFileChange = (event) => {
    const input = event.target;
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

            const notes = getObjectOrEmpty(parsed.notes);
            const metadata = getObjectOrEmpty(parsed.metadata);
            const snapshot = await getStorageSnapshot();
            const existingNotes = getObjectOrEmpty(snapshot[NOTES_STORAGE_KEY]);
            const existingMetadata = getObjectOrEmpty(snapshot[METADATA_STORAGE_KEY]);
            const mergedNotes = mergeNotesPayload(existingNotes, notes);
            const mergedMetadata = mergeMetadataPayload(existingMetadata, metadata, mergedNotes);

            await persistBackupPayload(mergedNotes, mergedMetadata);
            setSettingsMessage('Backup imported successfully.', 'success');
            loadVideos();
        } catch (error) {
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

const formatTimestamp = (value) => {
    if (!Number.isFinite(value)) {
        return '00:00';
    }

    const totalSeconds = Math.max(0, Math.floor(value));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const minutePart = minutes.toString().padStart(2, '0');
    const secondPart = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutePart}:${secondPart}`;
    }

    return `${minutePart}:${secondPart}`;
};

const getStorageSnapshot = () =>
    new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve({});
            return;
        }

        chrome.storage.local.get([NOTES_STORAGE_KEY, METADATA_STORAGE_KEY], (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                resolve({});
                return;
            }
            resolve(result || {});
        });
    });

const normalizeNotes = (videoId, notes) =>
    notes
        .map((note, index) => {
            if (!note || typeof note !== 'object') {
                return null;
            }

            const timestamp = Number(note.timestamp);
            if (!Number.isFinite(timestamp)) {
                return null;
            }

            const rawText = typeof note.text === 'string' ? note.text : '';
            const trimmedText = rawText.trim();
            const displayText = trimmedText || '(No text)';

            const updatedAtCandidate = Number(note.updatedAt);
            const createdAtCandidate = Number(note.createdAt);
            const updatedAt = Number.isFinite(updatedAtCandidate)
                ? updatedAtCandidate
                : Number.isFinite(createdAtCandidate)
                  ? createdAtCandidate
                  : 0;

            return {
                id:
                    typeof note.id === 'string' && note.id.trim()
                        ? note.id
                        : `${videoId}-${index}-${timestamp}`,
                text: displayText,
                textLower: trimmedText.toLowerCase(),
                timestamp,
                formattedTimestamp: formatTimestamp(timestamp),
                updatedAt
            };
        })
        .filter(Boolean)
        .sort((a, b) => a.timestamp - b.timestamp);

const transformStoragePayload = (notesPayload, metadataPayload) => {
    if (!notesPayload || typeof notesPayload !== 'object') {
        return [];
    }

    const videos = [];

    Object.entries(notesPayload).forEach(([videoId, rawNotes]) => {
        if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
            return;
        }

        const normalizedNotes = normalizeNotes(videoId, rawNotes);
        if (normalizedNotes.length === 0) {
            return;
        }

        const metadata =
            metadataPayload && typeof metadataPayload === 'object' ? metadataPayload[videoId] : undefined;

        const rawTitle = metadata && typeof metadata.title === 'string' ? metadata.title.trim() : '';
        const title = rawTitle || videoId;

        const updatedAtValues = [];
        if (metadata && Number.isFinite(Number(metadata.updatedAt))) {
            updatedAtValues.push(Number(metadata.updatedAt));
        }

        normalizedNotes.forEach((note) => {
            if (Number.isFinite(note.updatedAt) && note.updatedAt > 0) {
                updatedAtValues.push(note.updatedAt);
            }
        });

        const updatedAt = updatedAtValues.length > 0 ? Math.max(...updatedAtValues) : 0;

        videos.push({
            videoId,
            title,
            titleLower: title.toLowerCase(),
            noteCount: normalizedNotes.length,
            updatedAt,
            notes: normalizedNotes
        });
    });

    videos.sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) {
            return b.updatedAt - a.updatedAt;
        }
        return a.title.localeCompare(b.title);
    });

    return videos;
};

const computeRenderableVideos = () => {
    const trimmedTerm = state.searchTerm.trim();
    const isSearchActive = trimmedTerm.length > 0;
    if (!isSearchActive) {
        return state.videos.map((video) => ({
            video,
            displayNotes: video.notes,
            forceExpanded: false
        }));
    }

    const normalizedTerm = trimmedTerm.toLowerCase();
    const matches = [];

    state.videos.forEach((video) => {
        const titleMatch = video.titleLower.includes(normalizedTerm);
        const matchingNotes = video.notes.filter((note) => note.textLower.includes(normalizedTerm));
        if (!titleMatch && matchingNotes.length === 0) {
            return;
        }

        matches.push({
            video,
            displayNotes: titleMatch ? video.notes : matchingNotes,
            forceExpanded: true
        });
    });

    return matches;
};

const toggleVideoExpansion = (videoId) => {
    if (!videoId) {
        return;
    }

    if (state.expandedVideos.has(videoId)) {
        state.expandedVideos.delete(videoId);
    } else {
        state.expandedVideos.add(videoId);
    }

    render();
};

const openNote = (videoId, timestampSeconds) => {
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
                // eslint-disable-next-line no-console
                console.error('Unable to open video tab:', chrome.runtime.lastError);
                return;
            }
            window.close();
        });
        return;
    }

    window.open(targetUrl.toString(), '_blank', 'noopener');
    window.close();
};

const render = () => {
    const searchTrimmed = state.searchTerm.trim();
    const isSearchActive = searchTrimmed.length > 0;
    const renderable = computeRenderableVideos();

    const { videoList, emptyState } = elements;
    if (!videoList || !emptyState) {
        return;
    }

    videoList.textContent = '';

    if (state.videos.length === 0) {
        emptyState.hidden = false;
        emptyState.textContent = 'You have not saved any notes yet.';
        return;
    }

    if (renderable.length === 0) {
        emptyState.hidden = false;
        emptyState.textContent = `No matches for "${searchTrimmed}".`;
        return;
    }

    emptyState.hidden = true;

    renderable.forEach(({ video, displayNotes, forceExpanded }) => {
        const listItem = document.createElement('li');
        listItem.className = 'video-item';

        const isExpanded = isSearchActive || forceExpanded || state.expandedVideos.has(video.videoId);
        if (isExpanded) {
            listItem.classList.add('video-item--expanded');
        }

        const headerButton = document.createElement('button');
        headerButton.type = 'button';
        headerButton.className = 'video-header';
        headerButton.dataset.videoId = video.videoId;
        if (isSearchActive) {
            headerButton.classList.add('video-header--static');
        }

        const titleSpan = document.createElement('span');
        titleSpan.className = 'video-header__title';
        titleSpan.textContent = video.title;

        const countSpan = document.createElement('span');
        countSpan.className = 'video-header__count';
        const matchingCountLabel =
            isSearchActive && displayNotes.length !== video.noteCount
                ? `${displayNotes.length} of ${video.noteCount} notes`
                : `${video.noteCount} ${video.noteCount === 1 ? 'note' : 'notes'}`;
        countSpan.textContent = matchingCountLabel;

        const chevronSpan = document.createElement('span');
        chevronSpan.className = 'video-header__chevron';
        chevronSpan.setAttribute('aria-hidden', 'true');

        headerButton.append(titleSpan, countSpan, chevronSpan);

        if (!isSearchActive) {
            headerButton.addEventListener('click', () => toggleVideoExpansion(video.videoId));
        }

        const notesList = document.createElement('ul');
        notesList.className = 'notes-list';

        displayNotes.forEach((note) => {
            const noteItem = document.createElement('li');
            noteItem.className = 'note-item';

            const noteButton = document.createElement('button');
            noteButton.type = 'button';
            noteButton.className = 'note-button';
            noteButton.dataset.videoId = video.videoId;
            noteButton.dataset.timestamp = note.timestamp.toString();

            noteButton.addEventListener('click', () => openNote(video.videoId, note.timestamp));

            const timestampSpan = document.createElement('span');
            timestampSpan.className = 'note-button__timestamp';
            timestampSpan.textContent = note.formattedTimestamp;

            const textSpan = document.createElement('span');
            textSpan.className = 'note-button__text';
            textSpan.textContent = note.text;

            noteButton.append(timestampSpan, textSpan);
            noteItem.appendChild(noteButton);
            notesList.appendChild(noteItem);
        });

        listItem.append(headerButton, notesList);
        videoList.appendChild(listItem);
    });
};

const handleSearchInput = (event) => {
    state.searchTerm = event.target.value || '';
    render();
};

const loadVideos = async () => {
    const snapshot = await getStorageSnapshot();
    const notesPayload = snapshot[NOTES_STORAGE_KEY] || {};
    const metadataPayload = snapshot[METADATA_STORAGE_KEY] || {};
    const videos = transformStoragePayload(notesPayload, metadataPayload);
    const existingIds = new Set(videos.map((video) => video.videoId));
    state.expandedVideos = new Set(
        [...state.expandedVideos].filter((videoId) => existingIds.has(videoId))
    );

    if (state.expandedVideos.size === 0 && videos.length === 1) {
        state.expandedVideos.add(videos[0].videoId);
    }

    state.videos = videos;
    render();
};

const storageChangeHandler = (changes, areaName) => {
    if (areaName !== 'local') {
        return;
    }

    if (changes[NOTES_STORAGE_KEY] || changes[METADATA_STORAGE_KEY]) {
        loadVideos();
    }
};

const initialize = () => {
    syncViewVisibility();

    if (elements.searchInput) {
        elements.searchInput.addEventListener('input', handleSearchInput);
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

    if (elements.zenModeToggle) {
        elements.zenModeToggle.addEventListener('change', (e) => {
            const isEnabled = e.target.checked;
            if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
                chrome.storage.local.set({ [ZEN_MODE_STORAGE_KEY]: isEnabled });
            }
        });

        if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
            chrome.storage.local.get([ZEN_MODE_STORAGE_KEY], (result) => {
                elements.zenModeToggle.checked = !!result[ZEN_MODE_STORAGE_KEY];
            });
        }
    }

    if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
        chrome.storage.onChanged.addListener(storageChangeHandler);
        window.addEventListener('unload', () => {
            chrome.storage.onChanged.removeListener(storageChangeHandler);
        });
    }

    loadVideos().catch(() => {
        state.videos = [];
        render();
    });
};

initialize();
