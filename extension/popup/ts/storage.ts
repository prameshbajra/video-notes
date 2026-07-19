import {
    ANNOTATIONS_ENABLED_STORAGE_KEY,
    DELETE_HOLD_ENABLED_STORAGE_KEY,
    ENABLED_STORAGE_KEY,
    FLASHCARDS_CACHE_STORAGE_KEY,
    FLASHCARDS_ENABLED_STORAGE_KEY,
    GEMINI_API_KEY_STORAGE_KEY,
    MD_EXPORT_ENABLED_STORAGE_KEY,
    MD_TEMPLATE_STORAGE_KEY,
    MD_TEMPLATE_VERSION,
    MD_TEMPLATE_VERSION_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    PLACEMENT_STORAGE_KEY,
    ZEN_MODE_STORAGE_KEY
} from './constants.js';

const resolveEnabledSetting = (value: unknown): boolean => value !== false;
const resolveZenModeSetting = (value: unknown): boolean => value === true;
const resolveAnnotationsEnabledSetting = (value: unknown): boolean => value !== false;
const resolveFlashcardsEnabledSetting = (value: unknown): boolean => value === true;
const resolveNewTabFlashcardsEnabledSetting = (value: unknown): boolean => value === true;

const getStorageSnapshot = (): Promise<StorageSnapshot> =>
    new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve({});
            return;
        }

        chrome.storage.local.get(
            [
                NOTES_STORAGE_KEY,
                PLACEMENT_STORAGE_KEY,
                METADATA_STORAGE_KEY,
                ENABLED_STORAGE_KEY,
                ZEN_MODE_STORAGE_KEY,
                ANNOTATIONS_ENABLED_STORAGE_KEY,
                MD_EXPORT_ENABLED_STORAGE_KEY,
                MD_TEMPLATE_STORAGE_KEY,
                MD_TEMPLATE_VERSION_STORAGE_KEY,
                DELETE_HOLD_ENABLED_STORAGE_KEY,
                FLASHCARDS_ENABLED_STORAGE_KEY,
                NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY,
                GEMINI_API_KEY_STORAGE_KEY,
                FLASHCARDS_CACHE_STORAGE_KEY
            ],
            (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve({});
                    return;
                }
                resolve((result || {}) as StorageSnapshot);
            }
        );
    });

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

const persistNotesEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [ENABLED_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const removePlacementPreference = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.remove(PLACEMENT_STORAGE_KEY, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistZenModeEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [ZEN_MODE_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistAnnotationsEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [ANNOTATIONS_ENABLED_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistMdExportEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [MD_EXPORT_ENABLED_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistMdTemplate = (template: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({
            [MD_TEMPLATE_STORAGE_KEY]: template,
            [MD_TEMPLATE_VERSION_STORAGE_KEY]: MD_TEMPLATE_VERSION
        }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistDeleteHoldEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [DELETE_HOLD_ENABLED_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistFlashcardsEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [FLASHCARDS_ENABLED_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistNewTabFlashcardsEnabled = (isEnabled: boolean): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]: isEnabled }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistGeminiApiKey = (apiKey: string): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [GEMINI_API_KEY_STORAGE_KEY]: apiKey }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const removeGeminiApiKey = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.remove(GEMINI_API_KEY_STORAGE_KEY, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const persistFlashcardsCache = (cache: FlashcardsCache): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.set({ [FLASHCARDS_CACHE_STORAGE_KEY]: cache }, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

const removeFlashcardsCache = (): Promise<void> =>
    new Promise<void>((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            reject(new Error('Storage unavailable'));
            return;
        }

        chrome.storage.local.remove(FLASHCARDS_CACHE_STORAGE_KEY, () => {
            if (chrome.runtime && chrome.runtime.lastError) {
                reject(new Error(chrome.runtime.lastError.message));
                return;
            }
            resolve(undefined);
        });
    });

export {
    getStorageSnapshot,
    persistAnnotationsEnabled,
    persistBackupPayload,
    persistDeleteHoldEnabled,
    persistFlashcardsCache,
    persistFlashcardsEnabled,
    persistGeminiApiKey,
    persistMdExportEnabled,
    persistMdTemplate,
    persistNewTabFlashcardsEnabled,
    persistNotesEnabled,
    persistZenModeEnabled,
    removeFlashcardsCache,
    removeGeminiApiKey,
    removePlacementPreference,
    resolveEnabledSetting,
    resolveAnnotationsEnabledSetting,
    resolveFlashcardsEnabledSetting,
    resolveNewTabFlashcardsEnabledSetting,
    resolveZenModeSetting
};
