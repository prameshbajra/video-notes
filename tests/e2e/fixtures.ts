import { chromium, expect, test as base, type BrowserContext, type ServiceWorker } from '@playwright/test';
import { existsSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

const extensionPath = path.resolve(process.cwd(), 'extension', 'dist');
// Chromium extension service workers are most reliable in headed mode.
// CI runs this under xvfb; set HEADLESS=1 only for local experimentation.
const isHeadlessRun = process.env.HEADLESS === '1' && process.env.HEADED !== '1' && !process.argv.includes('--headed');

type StorageItems = Record<string, unknown>;
type StorageKeys = string | string[] | StorageItems | null;

interface ExtensionFixtures {
    context: BrowserContext;
    serviceWorker: ServiceWorker;
    extensionId: string;
    popupUrl: string;
    clearExtensionStorage: () => Promise<void>;
    setExtensionStorage: (items: StorageItems) => Promise<void>;
    seedExtensionStorage: (items: StorageItems) => Promise<void>;
    getExtensionStorage: (keys?: StorageKeys) => Promise<StorageItems>;
}

const test = base.extend<ExtensionFixtures>({
    context: async ({}, use) => {
        if (!existsSync(path.join(extensionPath, 'manifest.json'))) {
            throw new Error('Extension dist is missing. Run `npm run build` before Playwright tests.');
        }

        const userDataDir = await mkdtemp(path.join(tmpdir(), 'video-notes-e2e-'));
        const context = await chromium.launchPersistentContext(userDataDir, {
            headless: isHeadlessRun,
            viewport: { width: 1280, height: 900 },
            args: [
                `--disable-extensions-except=${extensionPath}`,
                `--load-extension=${extensionPath}`
            ]
        });

        try {
            await use(context);
        } finally {
            await context.close();
            await rm(userDataDir, { recursive: true, force: true });
        }
    },

    serviceWorker: async ({ context }, use) => {
        let serviceWorker = context.serviceWorkers()[0];
        if (!serviceWorker) {
            serviceWorker = await context.waitForEvent('serviceworker', { timeout: 10_000 });
        }
        await use(serviceWorker);
    },

    extensionId: async ({ serviceWorker }, use) => {
        const extensionId = new URL(serviceWorker.url()).host;
        await use(extensionId);
    },

    popupUrl: async ({ extensionId }, use) => {
        await use(`chrome-extension://${extensionId}/popup/popup.html`);
    },

    clearExtensionStorage: async ({ serviceWorker }, use) => {
        await use(async () => {
            await serviceWorker.evaluate(async () => {
                const chromeApi = (globalThis as unknown as {
                    chrome: {
                        runtime: { lastError?: { message?: string } };
                        storage: { local: { clear: (callback: () => void) => void } };
                    };
                }).chrome;

                await new Promise<void>((resolve, reject) => {
                    chromeApi.storage.local.clear(() => {
                        const error = chromeApi.runtime.lastError;
                        if (error) {
                            reject(new Error(error.message || 'Unable to clear extension storage'));
                            return;
                        }
                        resolve();
                    });
                });
            });
        });
    },

    setExtensionStorage: async ({ serviceWorker }, use) => {
        await use(async (items) => {
            await serviceWorker.evaluate(async (storageItems: StorageItems) => {
                const chromeApi = (globalThis as unknown as {
                    chrome: {
                        runtime: { lastError?: { message?: string } };
                        storage: { local: { set: (items: StorageItems, callback: () => void) => void } };
                    };
                }).chrome;

                await new Promise<void>((resolve, reject) => {
                    chromeApi.storage.local.set(storageItems, () => {
                        const error = chromeApi.runtime.lastError;
                        if (error) {
                            reject(new Error(error.message || 'Unable to update extension storage'));
                            return;
                        }
                        resolve();
                    });
                });
            }, items);
        });
    },

    seedExtensionStorage: async ({ clearExtensionStorage, setExtensionStorage }, use) => {
        await use(async (items) => {
            await clearExtensionStorage();
            await setExtensionStorage(items);
        });
    },

    getExtensionStorage: async ({ serviceWorker }, use) => {
        await use(async (keys = null) => serviceWorker.evaluate(async (storageKeys: StorageKeys) => {
            const chromeApi = (globalThis as unknown as {
                chrome: {
                    runtime: { lastError?: { message?: string } };
                    storage: { local: { get: (keys: StorageKeys, callback: (items: StorageItems) => void) => void } };
                };
            }).chrome;

            return new Promise<StorageItems>((resolve, reject) => {
                chromeApi.storage.local.get(storageKeys, (items) => {
                    const error = chromeApi.runtime.lastError;
                    if (error) {
                        reject(new Error(error.message || 'Unable to read extension storage'));
                        return;
                    }
                    resolve(items);
                });
            });
        }, keys));
    }
});

export { expect, test };
