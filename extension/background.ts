const SHARE_API_URL = 'https://share-api.video-notes.workers.dev/api/share';

chrome.runtime.onMessage.addListener(
    (
        message: { type: string; payload?: unknown },
        _sender: chrome.runtime.MessageSender,
        sendResponse: (response: { success: boolean; url?: string; id?: string; error?: string }) => void
    ) => {
        if (message.type !== 'SHARE_NOTES') {
            return false;
        }

        fetch(SHARE_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message.payload)
        })
            .then((res) => {
                if (!res.ok) {
                    return res.json().then((body: { error?: string }) => {
                        throw new Error(body.error || `HTTP ${res.status}`);
                    });
                }
                return res.json();
            })
            .then((data: { id: string; url: string }) => {
                sendResponse({ success: true, id: data.id, url: data.url });
            })
            .catch((err: Error) => {
                sendResponse({ success: false, error: err.message });
            });

        return true; // Keep message channel open for async response
    }
);

// --- New tab flashcards ---------------------------------------------------
// We do NOT use chrome_url_overrides (that would claim the new tab permanently and
// can't be handed back to the native page at runtime). Instead, when the feature is
// on AND a deck is already cached, we redirect freshly opened new-tab pages to the
// flashcard page. When off — or when there's nothing to show — the browser's native
// new tab is left untouched.

const NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY = 'videoNotes:newTabFlashcardsEnabled';
const FLASHCARDS_CACHE_STORAGE_KEY = 'videoNotes:flashcardsCache';
const NEWTAB_PAGE_PATH = 'newtab/newtab.html';

// URLs a browser assigns to a freshly opened "new tab" (Chromium + Firefox).
const NEW_TAB_URLS = new Set(['chrome://newtab/', 'chrome://new-tab-page/', 'about:newtab', 'about:home']);

const shouldShowFlashcards = (): Promise<boolean> =>
    new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve(false);
            return;
        }

        chrome.storage.local.get(
            [NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY, FLASHCARDS_CACHE_STORAGE_KEY],
            (result) => {
                if (chrome.runtime && chrome.runtime.lastError) {
                    resolve(false);
                    return;
                }

                const snapshot = (result || {}) as Record<string, unknown>;
                if (snapshot[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY] !== true) {
                    resolve(false);
                    return;
                }

                const cache = snapshot[FLASHCARDS_CACHE_STORAGE_KEY];
                const deck =
                    typeof cache === 'object' && cache !== null
                        ? (cache as Record<string, unknown>).deck
                        : undefined;
                resolve(Array.isArray(deck) && deck.length > 0);
            }
        );
    });

chrome.tabs.onCreated.addListener((tab) => {
    const url = tab.pendingUrl ?? tab.url ?? '';
    const tabId = tab.id;
    if (typeof tabId !== 'number' || !NEW_TAB_URLS.has(url)) {
        return;
    }

    shouldShowFlashcards()
        .then((show) => {
            if (show) {
                chrome.tabs.update(tabId, { url: chrome.runtime.getURL(NEWTAB_PAGE_PATH) }).catch(() => {});
            }
        })
        .catch(() => {});
});
