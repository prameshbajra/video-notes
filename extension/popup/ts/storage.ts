import {
    DELETE_HOLD_ENABLED_STORAGE_KEY,
    ENABLED_STORAGE_KEY,
    MD_EXPORT_ENABLED_STORAGE_KEY,
    MD_TEMPLATE_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    ZEN_MODE_STORAGE_KEY
} from './constants.js';

const resolveEnabledSetting = (value: unknown): boolean => value !== false;
const resolveZenModeSetting = (value: unknown): boolean => value === true;

const getStorageSnapshot = (): Promise<StorageSnapshot> =>
    new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve({});
            return;
        }

        chrome.storage.local.get(
            [
                NOTES_STORAGE_KEY,
                METADATA_STORAGE_KEY,
                ENABLED_STORAGE_KEY,
                ZEN_MODE_STORAGE_KEY,
                MD_EXPORT_ENABLED_STORAGE_KEY,
                MD_TEMPLATE_STORAGE_KEY,
                DELETE_HOLD_ENABLED_STORAGE_KEY
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

        chrome.storage.local.set({ [MD_TEMPLATE_STORAGE_KEY]: template }, () => {
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

export {
    getStorageSnapshot,
    persistBackupPayload,
    persistDeleteHoldEnabled,
    persistMdExportEnabled,
    persistMdTemplate,
    persistNotesEnabled,
    persistZenModeEnabled,
    resolveEnabledSetting,
    resolveZenModeSetting
};
