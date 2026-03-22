const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const MAX_TITLE_LENGTH = 500;
const MAX_NOTE_TEXT_LENGTH = 2000;
const MAX_NOTES_COUNT = 500;
const MAX_PAYLOAD_BYTES = 256 * 1024;

interface ShareNote {
    timestamp: number;
    text: string;
}

export interface ValidatedPayload {
    videoId: string;
    title: string;
    notes: ShareNote[];
}

export const validatePayload = (body: unknown, rawSize: number): ValidatedPayload => {
    if (rawSize > MAX_PAYLOAD_BYTES) {
        throw new Error('Payload too large');
    }

    if (!body || typeof body !== 'object') {
        throw new Error('Invalid payload');
    }

    const obj = body as Record<string, unknown>;

    if (typeof obj.videoId !== 'string' || !VIDEO_ID_RE.test(obj.videoId)) {
        throw new Error('Invalid videoId');
    }

    if (typeof obj.title !== 'string' || obj.title.length === 0) {
        throw new Error('Invalid title');
    }

    const title = obj.title.slice(0, MAX_TITLE_LENGTH);

    if (!Array.isArray(obj.notes) || obj.notes.length === 0) {
        throw new Error('Notes must be a non-empty array');
    }

    if (obj.notes.length > MAX_NOTES_COUNT) {
        throw new Error(`Maximum ${MAX_NOTES_COUNT} notes allowed`);
    }

    const notes: ShareNote[] = [];
    for (const note of obj.notes) {
        if (!note || typeof note !== 'object') {
            throw new Error('Invalid note');
        }
        const n = note as Record<string, unknown>;
        if (typeof n.timestamp !== 'number' || !Number.isFinite(n.timestamp) || n.timestamp < 0) {
            throw new Error('Invalid note timestamp');
        }
        if (typeof n.text !== 'string' || n.text.length === 0) {
            throw new Error('Invalid note text');
        }
        notes.push({
            timestamp: n.timestamp,
            text: n.text.slice(0, MAX_NOTE_TEXT_LENGTH)
        });
    }

    return { videoId: obj.videoId, title, notes };
};
