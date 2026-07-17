import {
    ANNOTATIONS_ENABLED_STORAGE_KEY,
    ENABLED_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    ZEN_MODE_STORAGE_KEY
} from './constants.js';

const resolveEnabledSetting = (value: unknown): boolean => value !== false;
const resolveZenModeSetting = (value: unknown): boolean => value === true;
const resolveAnnotationsEnabledSetting = (value: unknown): boolean => value !== false;

const getStorageArea = (): chrome.storage.LocalStorageArea | null => {
    const hasRuntime =
        typeof chrome !== 'undefined' && chrome.runtime && typeof chrome.runtime.id === 'string';
    if (hasRuntime && chrome.storage && chrome.storage.local) {
        return chrome.storage.local;
    }
    return null;
};

const getNotesEnabledSetting = (): Promise<boolean> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        try {
            storage.get([ENABLED_STORAGE_KEY], (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve(true);
                    return;
                }
                resolve(resolveEnabledSetting(result[ENABLED_STORAGE_KEY]));
            });
        } catch {
            resolve(true);
        }
    });
};

const getZenModeSetting = (): Promise<boolean> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve(false);
    }

    return new Promise((resolve) => {
        try {
            storage.get([ZEN_MODE_STORAGE_KEY], (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve(false);
                    return;
                }
                resolve(resolveZenModeSetting(result[ZEN_MODE_STORAGE_KEY]));
            });
        } catch {
            resolve(false);
        }
    });
};

const getAnnotationsEnabledSetting = (): Promise<boolean> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve(true);
    }

    return new Promise((resolve) => {
        try {
            storage.get([ANNOTATIONS_ENABLED_STORAGE_KEY], (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve(true);
                    return;
                }
                resolve(resolveAnnotationsEnabledSetting(result[ANNOTATIONS_ENABLED_STORAGE_KEY]));
            });
        } catch {
            resolve(true);
        }
    });
};

const persistZenModeSetting = (isEnabled: boolean): Promise<void> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        try {
            storage.set({ [ZEN_MODE_STORAGE_KEY]: isEnabled }, () => {
                resolve(undefined);
            });
        } catch {
            resolve(undefined);
        }
    });
};

const getStoredNotes = (): Promise<NotesIndex> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve({});
    }

    return new Promise((resolve) => {
        try {
            storage.get([NOTES_STORAGE_KEY], (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve({});
                    return;
                }
                const notes = (result[NOTES_STORAGE_KEY] as NotesIndex | undefined) || {};
                resolve(notes);
            });
        } catch {
            resolve({});
        }
    });
};

const saveStoredNotes = (payload: NotesIndex): Promise<void> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
        try {
            storage.set({ [NOTES_STORAGE_KEY]: payload }, () => {
                const runtimeError = chrome.runtime?.lastError;
                if (runtimeError) {
                    reject(new Error(runtimeError.message || 'Unable to save notes'));
                    return;
                }
                resolve(undefined);
            });
        } catch (error) {
            reject(error instanceof Error ? error : new Error('Unable to save notes'));
        }
    });
};

const getStoredMetadata = (): Promise<MetadataIndex> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve({});
    }

    return new Promise((resolve) => {
        try {
            storage.get([METADATA_STORAGE_KEY], (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve({});
                    return;
                }
                const metadata = (result[METADATA_STORAGE_KEY] as MetadataIndex | undefined) || {};
                resolve(metadata);
            });
        } catch {
            resolve({});
        }
    });
};

const saveStoredMetadata = (payload: MetadataIndex): Promise<void> => {
    const storage = getStorageArea();
    if (!storage) {
        return Promise.resolve();
    }

    return new Promise((resolve) => {
        try {
            storage.set({ [METADATA_STORAGE_KEY]: payload }, () => {
                resolve(undefined);
            });
        } catch {
            resolve(undefined);
        }
    });
};

const persistVideoMetadata = async (videoId: string, metadata: MetadataEntry | null): Promise<void> => {
    if (!videoId) {
        return;
    }

    const allMetadata = await getStoredMetadata();

    if (!metadata) {
        if (Object.prototype.hasOwnProperty.call(allMetadata, videoId)) {
            delete allMetadata[videoId];
            await saveStoredMetadata(allMetadata);
        }
        return;
    }

    const existing = allMetadata[videoId] || {};
    const merged = {
        ...existing,
        ...metadata
    };

    const keys = Object.keys(metadata);
    const hasChanges = keys.some((key) => existing[key] !== metadata[key]);
    if (!hasChanges) {
        return;
    }

    merged.updatedAt = Date.now();
    allMetadata[videoId] = merged;
    await saveStoredMetadata(allMetadata);
};

const getVideoTitleText = (): string => {
    const titleElement = document.querySelector('#primary-inner ytd-watch-metadata #title');
    if (titleElement && typeof titleElement.textContent === 'string') {
        const text = titleElement.textContent.trim();
        if (text) {
            return text;
        }
    }

    const documentTitle = typeof document !== 'undefined' && document.title ? document.title : '';
    const cleaned = documentTitle.replace(/\s+-\s+YouTube$/, '').trim();
    if (cleaned) {
        return cleaned;
    }

    return documentTitle.trim() || 'Untitled video';
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normalizeAnnotationImage = (value: unknown): NoteAnnotationImage | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const dataUrl = typeof value.dataUrl === 'string' ? value.dataUrl : '';
    const width = Number(value.width);
    const height = Number(value.height);
    const generatedAt = Number(value.generatedAt);

    if (!dataUrl.startsWith('data:image/png;base64,')) {
        return null;
    }

    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return null;
    }

    if (!Number.isFinite(generatedAt) || generatedAt <= 0) {
        return null;
    }

    return { dataUrl, width, height, generatedAt };
};

const normalizeAnnotationViewport = (value: unknown): NoteAnnotationViewport | null => {
    if (!isPlainObject(value)) {
        return null;
    }

    const width = Number(value.width);
    const height = Number(value.height);
    if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
        return null;
    }

    return { width, height };
};

const normalizeAnnotation = (value: unknown): NoteAnnotation | undefined => {
    if (!isPlainObject(value) || value.version !== 1 || !isPlainObject(value.scene)) {
        return undefined;
    }

    const image = normalizeAnnotationImage(value.image);
    const viewport = normalizeAnnotationViewport(value.viewport);
    if (!image || !viewport) {
        return undefined;
    }

    return {
        version: 1,
        scene: { ...value.scene },
        image,
        viewport
    };
};

const loadNotesForVideo = async (videoId: string): Promise<Note[]> => {
    if (!videoId) {
        return [];
    }

    const allNotes = await getStoredNotes();
    const notes = Array.isArray(allNotes[videoId]) ? allNotes[videoId] : [];
    return notes
        .map((note, index): Note | null => {
            const timestamp = Number(note.timestamp);
            if (!Number.isFinite(timestamp)) {
                return null;
            }

            const text = typeof note.text === 'string' ? note.text : '';
            const createdAtCandidate = Number(note.createdAt);
            const updatedAtCandidate = Number(note.updatedAt);
            const createdAt = Number.isFinite(createdAtCandidate) ? createdAtCandidate : Date.now();
            const updatedAt = Number.isFinite(updatedAtCandidate) ? updatedAtCandidate : createdAt;
            const id =
                typeof note.id === 'string' && note.id.trim()
                    ? note.id
                    : `${videoId}-${index}-${timestamp}`;

            const normalizedNote: Note = {
                id,
                timestamp,
                text,
                createdAt,
                updatedAt
            };

            const annotation = normalizeAnnotation(note.annotation);
            if (annotation) {
                normalizedNote.annotation = annotation;
            }

            return normalizedNote;
        })
        .filter((note): note is Note => Boolean(note))
        .sort((a, b) => a.timestamp - b.timestamp);
};

const persistNotesForVideo = async (videoId: string, notes: Note[]): Promise<void> => {
    if (!videoId) {
        return;
    }

    const allNotes = await getStoredNotes();
    const notePayload: StoredNote[] = notes.map((note) => ({ ...note } as StoredNote));
    allNotes[videoId] = notePayload;
    await saveStoredNotes(allNotes);

    if (!Array.isArray(notes) || notes.length === 0) {
        await persistVideoMetadata(videoId, null).catch(() => {});
        return;
    }

    await persistVideoMetadata(videoId, {
        title: getVideoTitleText(),
        noteCount: notes.length
    }).catch(() => {});
};

export {
    getAnnotationsEnabledSetting,
    getNotesEnabledSetting,
    getVideoTitleText,
    getZenModeSetting,
    loadNotesForVideo,
    persistNotesForVideo,
    persistVideoMetadata,
    persistZenModeSetting,
    resolveAnnotationsEnabledSetting,
    resolveEnabledSetting,
    resolveZenModeSetting
};
