(() => {
    const NOTES_STORAGE_KEY = 'videoNotes:notes';
    const METADATA_STORAGE_KEY = 'videoNotes:metadata';
    const VIEW_NOTES = 'notes';
    const VIEW_SETTINGS = 'settings';

    const state: PopupState = {
        videos: [],
        expandedVideos: new Set<string>(),
        searchTerm: '',
        activeView: VIEW_NOTES
    };

    const elements: PopupElements = {
        searchInput: document.getElementById('search-input') as HTMLInputElement | null,
        videoList: document.getElementById('video-list') as HTMLUListElement | null,
        emptyState: document.getElementById('empty-state') as HTMLDivElement | null,
        notesView: document.getElementById('notes-view') as HTMLDivElement | null,
        settingsView: document.getElementById('settings-view') as HTMLDivElement | null,
        settingsButton: document.getElementById('settings-button') as HTMLButtonElement | null,
        backButton: document.getElementById('back-button') as HTMLButtonElement | null,
        exportButton: document.getElementById('export-button') as HTMLButtonElement | null,
        importButton: document.getElementById('import-button') as HTMLButtonElement | null,
        importInput: document.getElementById('import-input') as HTMLInputElement | null,
        settingsMessage: document.getElementById('settings-message') as HTMLParagraphElement | null
    };

    const SETTINGS_MESSAGE_STATES = ['settings-message--success', 'settings-message--error'] as const;

    const isPlainObject = (value: unknown): value is Record<string, unknown> =>
        Boolean(value) && typeof value === 'object' && !Array.isArray(value);

    const getObjectOrEmpty = <T extends Record<string, unknown>>(value: unknown): T =>
        (isPlainObject(value) ? (value as T) : ({} as T));

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

    const createDeleteIcon = (): SVGSVGElement => {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'delete-button__icon');
        svg.setAttribute('viewBox', '0 0 24 24');
        svg.setAttribute('aria-hidden', 'true');

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', 'M6 6l12 12M6 18 18 6');
        path.setAttribute('stroke', 'currentColor');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');

        svg.appendChild(path);
        return svg;
    };

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

    const persistBackupPayload = (notes: NotesIndex, metadata: MetadataIndex): Promise<void> =>
        new Promise<void>((resolve, reject) => {
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
                    resolve(undefined);
                }
            );
        });

    const getNoteDedupKey = (note: StoredNote): string | null => {
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

    const mergeNotesPayload = (existingNotes: NotesIndex, importedNotes: NotesIndex): NotesIndex => {
        const merged: NotesIndex = { ...existingNotes };

        Object.entries(importedNotes).forEach(([videoId, rawNotes]) => {
            if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
                return;
            }

            const sanitizedNotes = rawNotes.filter((note): note is StoredNote => isPlainObject(note));
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

    const mergeMetadataPayload = (
        existingMetadata: MetadataIndex,
        importedMetadata: MetadataIndex,
        mergedNotes: NotesIndex
    ): MetadataIndex => {
        const merged: MetadataIndex = {};

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

    const formatTimestamp = (value: number): string => {
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

    const getStorageSnapshot = (): Promise<StorageSnapshot> =>
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
                resolve((result || {}) as StorageSnapshot);
            });
        });

    const persistNotesPayload = async (notesPayload: NotesIndex, metadataPayload: MetadataIndex): Promise<void> => {
        await persistBackupPayload(notesPayload, metadataPayload);
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

        await persistNotesPayload(notesPayload, metadataPayload);
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
            await persistNotesPayload(notesPayload, metadataPayload);
            return;
        }

        notesPayload[videoId] = filteredNotes;
        const existingMetadata = isPlainObject(metadataPayload[videoId]) ? metadataPayload[videoId] : {};
        metadataPayload[videoId] = {
            ...existingMetadata,
            noteCount: filteredNotes.length,
            updatedAt: Date.now()
        };

        await persistNotesPayload(notesPayload, metadataPayload);
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

    const normalizeNotes = (videoId: string, notes: StoredNote[]): NormalizedNote[] =>
        notes
            .map((note, index): NormalizedNote | null => {
                if (!note || typeof note !== 'object') {
                    return null;
                }

                const timestamp = Number(note.timestamp);
                if (!Number.isFinite(timestamp)) {
                    return null;
                }

                const dedupKey = getNoteDedupKey(note);
                if (!dedupKey) {
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
                    updatedAt,
                    dedupKey
                };
            })
            .filter((value): value is NormalizedNote => Boolean(value))
            .sort((a, b) => a.timestamp - b.timestamp);

    const transformStoragePayload = (notesPayload: NotesIndex, metadataPayload: MetadataIndex): VideoListItem[] => {
        if (!notesPayload || typeof notesPayload !== 'object') {
            return [];
        }

        const videos: VideoListItem[] = [];

        Object.entries(notesPayload).forEach(([videoId, rawNotes]) => {
            if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
                return;
            }

            const sanitizedNotes = rawNotes.filter((note): note is StoredNote => isPlainObject(note));
            const normalizedNotes = normalizeNotes(videoId, sanitizedNotes);
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

    const computeRenderableVideos = (): Array<{
        video: VideoListItem;
        displayNotes: NormalizedNote[];
        forceExpanded: boolean;
    }> => {
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
        const matches: Array<{
            video: VideoListItem;
            displayNotes: NormalizedNote[];
            forceExpanded: boolean;
        }> = [];

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

    const toggleVideoExpansion = (videoId: string): void => {
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
                window.close();
            });
            return;
        }

        window.open(targetUrl.toString(), '_blank', 'noopener');
        window.close();
    };

    const render = (): void => {
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

            const headerRow = document.createElement('div');
            headerRow.className = 'video-header-row';

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

            const videoDeleteButton = document.createElement('button');
            videoDeleteButton.type = 'button';
            videoDeleteButton.className = 'delete-chip video-delete-button';
            videoDeleteButton.setAttribute('aria-label', `Delete all notes for "${video.title}"`);
            videoDeleteButton.appendChild(createDeleteIcon());
            videoDeleteButton.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                handleVideoDelete(video.videoId);
            });

            headerRow.append(headerButton, videoDeleteButton);

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
                noteButton.dataset.noteKey = note.dedupKey;

                noteButton.addEventListener('click', () => openNote(video.videoId, note.timestamp));

                const timestampSpan = document.createElement('span');
                timestampSpan.className = 'note-button__timestamp';
                timestampSpan.textContent = note.formattedTimestamp;

                const textSpan = document.createElement('span');
                textSpan.className = 'note-button__text';
                textSpan.textContent = note.text;

                const noteDeleteButton = document.createElement('button');
                noteDeleteButton.type = 'button';
                noteDeleteButton.className = 'delete-chip note-delete-button';
                noteDeleteButton.setAttribute('aria-label', `Delete note at ${note.formattedTimestamp}`);
                noteDeleteButton.appendChild(createDeleteIcon());
                noteDeleteButton.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    handleNoteDelete(video.videoId, note.dedupKey);
                });

                noteButton.append(timestampSpan, textSpan);
                noteItem.append(noteButton, noteDeleteButton);
                notesList.appendChild(noteItem);
            });

            listItem.append(headerRow, notesList);
            videoList.appendChild(listItem);
        });
    };

    const handleSearchInput = (event: Event): void => {
        const target = event.target as HTMLInputElement | null;
        state.searchTerm = target?.value || '';
        render();
    };

    const loadVideos = async (): Promise<void> => {
        const snapshot = await getStorageSnapshot();
        const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
        const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
        const videos = transformStoragePayload(notesPayload, metadataPayload);
        const existingIds = new Set(videos.map((video) => video.videoId));
        state.expandedVideos = new Set(
            [...state.expandedVideos].filter((videoId) => existingIds.has(videoId))
        );

        if (state.expandedVideos.size === 0 && videos.length === 1 && videos[0]?.videoId) {
            state.expandedVideos.add(videos[0].videoId);
        }

        state.videos = videos;
        render();
    };

    const storageChangeHandler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string): void => {
        if (areaName !== 'local') {
            return;
        }

        if (changes[NOTES_STORAGE_KEY] || changes[METADATA_STORAGE_KEY]) {
            loadVideos();
        }
    };

    const initialize = (): void => {
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

})();
