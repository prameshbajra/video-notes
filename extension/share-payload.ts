const MAX_SHARE_PAYLOAD_BYTES = 2 * 1024 * 1024;
const MAX_SHARE_ANNOTATION_IMAGE_BYTES = 300 * 1024;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';

interface SharePayloadLike {
    notes: Array<{
        annotation?: {
            image?: {
                dataUrl?: string;
            };
        };
    }>;
}

const getDecodedBase64ByteLength = (base64: string): number => {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
};

const assertSharePayloadIsValid = (payload: SharePayloadLike): void => {
    const rawSize = new TextEncoder().encode(JSON.stringify(payload)).length;
    if (rawSize > MAX_SHARE_PAYLOAD_BYTES) {
        throw new Error('This share is larger than 2 MB. Remove some annotations and try again.');
    }

    for (const note of payload.notes) {
        const dataUrl = note.annotation?.image?.dataUrl;
        if (!dataUrl?.startsWith(PNG_DATA_URL_PREFIX)) {
            continue;
        }

        const decodedSize = getDecodedBase64ByteLength(dataUrl.slice(PNG_DATA_URL_PREFIX.length));
        if (decodedSize > MAX_SHARE_ANNOTATION_IMAGE_BYTES) {
            throw new Error('An annotation image is larger than 300 KB. Simplify the drawing and try again.');
        }
    }
};

const getShareFailureMessage = (error: unknown): string => {
    const message = error instanceof Error && error.message.trim()
        ? error.message.trim()
        : 'Unknown error';

    if (message === 'Payload too large') {
        return 'This share is larger than 2 MB. Remove some annotations and try again.';
    }
    if (message === 'Annotation image too large') {
        return 'An annotation image is larger than 300 KB. Simplify the drawing and try again.';
    }
    if (message.toLowerCase().includes('rate limit')) {
        return 'Too many share attempts. Wait a minute and try again.';
    }
    if (message === 'Failed to fetch') {
        return 'Unable to reach the share service. Check your connection and try again.';
    }

    return `Unable to share: ${message}`;
};

export {
    MAX_SHARE_ANNOTATION_IMAGE_BYTES,
    MAX_SHARE_PAYLOAD_BYTES,
    assertSharePayloadIsValid,
    getDecodedBase64ByteLength,
    getShareFailureMessage
};
