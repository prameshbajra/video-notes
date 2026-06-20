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
// on, we redirect freshly opened new-tab pages to the flashcard page. The page can
// then show a card, warm/generate a deck, or onboard the Gemini API key inline.

const NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY = 'videoNotes:newTabFlashcardsEnabled';
const NEWTAB_PAGE_PATH = 'newtab/newtab.html';

// URLs a browser assigns to a freshly opened "new tab" (Chromium + Firefox).
const NEW_TAB_URLS = new Set(['chrome://newtab/', 'chrome://new-tab-page/', 'about:newtab', 'about:home']);

const isNativeNewTabUrl = (url: string): boolean => NEW_TAB_URLS.has(url);

const isNewTabFlashcardsEnabled = (): Promise<boolean> =>
    new Promise((resolve) => {
        if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
            resolve(false);
            return;
        }

        chrome.storage.local.get(NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY, (result) => {
            if (chrome.runtime && chrome.runtime.lastError) {
                resolve(false);
                return;
            }

            const snapshot = (result || {}) as Record<string, unknown>;
            resolve(snapshot[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY] === true);
        });
    });

chrome.tabs.onCreated.addListener((tab) => {
    const url = tab.pendingUrl ?? tab.url ?? '';
    const tabId = tab.id;
    if (typeof tabId !== 'number' || !isNativeNewTabUrl(url)) {
        return;
    }

    isNewTabFlashcardsEnabled()
        .then((enabled) => {
            if (!enabled) {
                return;
            }

            return chrome.tabs.get(tabId).then((currentTab) => {
                const currentUrl = currentTab.pendingUrl ?? currentTab.url ?? '';
                if (!isNativeNewTabUrl(currentUrl)) {
                    return;
                }
                return chrome.tabs.update(tabId, { url: chrome.runtime.getURL(NEWTAB_PAGE_PATH) });
            });
        })
        .catch(() => {});
});
