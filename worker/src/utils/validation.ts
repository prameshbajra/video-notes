const VIDEO_ID_RE = /^[a-zA-Z0-9_-]{11}$/;
const MAX_TITLE_LENGTH = 500;
const MAX_NOTE_TEXT_LENGTH = 2000;
const MAX_NOTES_COUNT = 500;
export const MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
export const MAX_ANNOTATION_IMAGE_BYTES = 300 * 1024;
const MAX_ANNOTATION_DIMENSION = 10_000;
const PNG_DATA_URL_PREFIX = 'data:image/png;base64,';
const PNG_SIGNATURE_BASE64_PREFIX = 'iVBORw0KGgo';

interface ShareNote {
    timestamp: number;
    text: string;
    annotation?: ShareAnnotation;
}

interface ShareAnnotationImage {
    dataUrl: string;
    width: number;
    height: number;
    generatedAt: number;
}

interface ShareAnnotationViewport {
    width: number;
    height: number;
}

interface ShareAnnotation {
    version: 1;
    image: ShareAnnotationImage;
    viewport: ShareAnnotationViewport;
}

export interface ValidatedPayload {
    videoId: string;
    title: string;
    notes: ShareNote[];
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getDecodedBase64ByteLength = (base64: string): number => {
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    return Math.floor((base64.length * 3) / 4) - padding;
};

export const readBoundedRequestText = async (request: Request): Promise<string> => {
    const contentLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(contentLength) && contentLength > MAX_PAYLOAD_BYTES) {
        throw new Error('Payload too large');
    }

    if (!request.body) {
        return '';
    }

    const reader = request.body.getReader();
    const decoder = new TextDecoder();
    const parts: string[] = [];
    let rawSize = 0;

    while (true) {
        const { done, value } = await reader.read();
        if (done) {
            break;
        }

        rawSize += value.byteLength;
        if (rawSize > MAX_PAYLOAD_BYTES) {
            await reader.cancel();
            throw new Error('Payload too large');
        }
        parts.push(decoder.decode(value, { stream: true }));
    }

    parts.push(decoder.decode());
    return parts.join('');
};

const validateDimension = (value: unknown, fieldName: string): number => {
    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
        throw new Error(`Invalid annotation ${fieldName}`);
    }

    if (value <= 0 || value > MAX_ANNOTATION_DIMENSION) {
        throw new Error(`Invalid annotation ${fieldName}`);
    }

    return value;
};

const validateAnnotation = (value: unknown): ShareAnnotation => {
    if (!isPlainObject(value) || value.version !== 1) {
        throw new Error('Invalid annotation');
    }

    if (!isPlainObject(value.image)) {
        throw new Error('Invalid annotation image');
    }

    if (!isPlainObject(value.viewport)) {
        throw new Error('Invalid annotation viewport');
    }

    const dataUrl = value.image.dataUrl;
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith(PNG_DATA_URL_PREFIX)) {
        throw new Error('Invalid annotation image data');
    }

    const base64 = dataUrl.slice(PNG_DATA_URL_PREFIX.length);
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || !base64.startsWith(PNG_SIGNATURE_BASE64_PREFIX)) {
        throw new Error('Invalid annotation image data');
    }

    if (getDecodedBase64ByteLength(base64) > MAX_ANNOTATION_IMAGE_BYTES) {
        throw new Error('Annotation image too large');
    }

    const imageWidth = validateDimension(value.image.width, 'image width');
    const imageHeight = validateDimension(value.image.height, 'image height');
    const viewportWidth = validateDimension(value.viewport.width, 'viewport width');
    const viewportHeight = validateDimension(value.viewport.height, 'viewport height');
    const generatedAt = value.image.generatedAt;
    if (typeof generatedAt !== 'number' || !Number.isFinite(generatedAt) || generatedAt <= 0) {
        throw new Error('Invalid annotation image timestamp');
    }

    return {
        version: 1,
        image: {
            dataUrl,
            width: imageWidth,
            height: imageHeight,
            generatedAt
        },
        viewport: {
            width: viewportWidth,
            height: viewportHeight
        }
    };
};

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
        if (!isPlainObject(note)) {
            throw new Error('Invalid note');
        }
        if (typeof note.timestamp !== 'number' || !Number.isFinite(note.timestamp) || note.timestamp < 0) {
            throw new Error('Invalid note timestamp');
        }
        if (typeof note.text !== 'string') {
            throw new Error('Invalid note text');
        }
        const validatedNote: ShareNote = {
            timestamp: note.timestamp,
            text: note.text.slice(0, MAX_NOTE_TEXT_LENGTH)
        };

        if (Object.prototype.hasOwnProperty.call(note, 'annotation')) {
            validatedNote.annotation = validateAnnotation(note.annotation);
        }

        // Drawing-only notes are allowed; a note with neither text nor a
        // drawing carries no content and is rejected.
        if (validatedNote.text.length === 0 && !validatedNote.annotation) {
            throw new Error('Invalid note text');
        }

        notes.push(validatedNote);
    }

    return { videoId: obj.videoId, title, notes };
};
