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
