import { state, ui } from './state.js';
import { getVideoTitleText } from './storage.js';
import { applyStyles } from './utils.js';

const buildSharePayload = (): { videoId: string; title: string; notes: { timestamp: number; text: string }[] } | null => {
    if (!state.videoId || state.notes.length === 0) {
        return null;
    }

    return {
        videoId: state.videoId,
        title: getVideoTitleText(),
        notes: state.notes.map((n) => ({
            timestamp: n.timestamp,
            text: n.text
        }))
    };
};

const sendShareRequest = (payload: object): Promise<{ id: string; url: string }> => {
    return new Promise((resolve, reject) => {
        if (typeof chrome === 'undefined' || !chrome.runtime || !chrome.runtime.sendMessage) {
            reject(new Error('Extension runtime unavailable'));
            return;
        }

        chrome.runtime.sendMessage(
            { type: 'SHARE_NOTES', payload },
            (response: { success: boolean; url?: string; id?: string; error?: string } | undefined) => {
                if (chrome.runtime.lastError) {
                    reject(new Error(chrome.runtime.lastError.message || 'Message failed'));
                    return;
                }

                if (!response || !response.success) {
                    reject(new Error(response?.error || 'Share failed'));
                    return;
                }

                resolve({ id: response.id || '', url: response.url || '' });
            }
        );
    });
};

const copyToClipboard = async (text: string): Promise<void> => {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
};

let toastTimer: ReturnType<typeof setTimeout> | null = null;

const showToast = (message: string, isError = false): void => {
    const container = ui.container;
    if (!container) {
        return;
    }

    if (toastTimer !== null) {
        clearTimeout(toastTimer);
        toastTimer = null;
    }

    const existing = container.querySelector('#video-notes-toast');
    if (existing) {
        existing.remove();
    }

    const toast = document.createElement('div');
    toast.id = 'video-notes-toast';
    applyStyles(toast, {
        position: 'absolute',
        top: '0',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '8px 16px',
        borderRadius: '8px',
        backgroundColor: isError ? '#d93025' : '#1a73e8',
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: '500',
        zIndex: '6000',
        pointerEvents: 'none',
        transition: 'opacity 300ms ease',
        whiteSpace: 'nowrap'
    });
    toast.textContent = message;
    container.appendChild(toast);

    toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
        toastTimer = null;
    }, 2500);
};

const handleShareButtonClick = async (): Promise<void> => {
    if (ui.shareButton?.disabled) {
        return;
    }

    const payload = buildSharePayload();
    if (!payload) {
        return;
    }

    const shareButton = ui.shareButton;
    if (shareButton) {
        shareButton.disabled = true;
        shareButton.textContent = 'Sharing...';
        shareButton.style.opacity = '0.6';
        shareButton.style.cursor = 'wait';
    }

    try {
        const result = await sendShareRequest(payload);
        await copyToClipboard(result.url);
        showToast('Share link copied to clipboard!');
    } catch {
        showToast('Failed to create share link. Please try again.', true);
    } finally {
        if (shareButton) {
            shareButton.textContent = 'Share';
        }
        updateShareButtonVisibility();
    }
};

const updateShareButtonVisibility = (): void => {
    const shareButton = ui.shareButton;
    if (!shareButton) {
        return;
    }
    const hasNotes = state.notes.length > 0;
    shareButton.style.display = 'inline-flex';
    shareButton.disabled = !hasNotes;
    shareButton.style.opacity = hasNotes ? '1' : '0.4';
    shareButton.style.cursor = hasNotes ? 'pointer' : 'not-allowed';
};

export { handleShareButtonClick, updateShareButtonVisibility };
