import { expect, test } from '@playwright/test';
import worker from '../../worker/src/index';
import {
    MAX_PAYLOAD_BYTES,
    readBoundedRequestText,
    validatePayload
} from '../../worker/src/utils/validation';

const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const createPayload = (annotation: unknown): Record<string, unknown> => ({
    videoId: 'abcDEF12345',
    title: 'Worker Validation Video',
    notes: [
        {
            timestamp: 12,
            text: 'Annotated note',
            annotation
        }
    ]
});

const getRawSize = (payload: unknown): number => new TextEncoder().encode(JSON.stringify(payload)).length;

test('worker validation accepts PNG annotation payloads', () => {
    const payload = createPayload({
        version: 1,
        image: {
            dataUrl: PNG_DATA_URL,
            width: 1,
            height: 1,
            generatedAt: 1_700_000_000_000
        },
        viewport: {
            width: 960,
            height: 360
        }
    });

    const validated = validatePayload(payload, getRawSize(payload));

    expect(validated.notes[0]?.annotation?.image.dataUrl).toBe(PNG_DATA_URL);
    expect(validated.notes[0]?.annotation?.viewport).toEqual({ width: 960, height: 360 });
});

test('worker validation rejects invalid annotation image payloads', () => {
    expect(() => validatePayload(createPayload({
        version: 1,
        image: {
            dataUrl: 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD',
            width: 1,
            height: 1,
            generatedAt: 1
        },
        viewport: {
            width: 960,
            height: 360
        }
    }), 1024)).toThrow('Invalid annotation image data');

    const oversizedPng = `data:image/png;base64,iVBORw0KGgo${'A'.repeat(410_000)}`;
    expect(() => validatePayload(createPayload({
        version: 1,
        image: {
            dataUrl: oversizedPng,
            width: 1,
            height: 1,
            generatedAt: 1
        },
        viewport: {
            width: 960,
            height: 360
        }
    }), 1024)).toThrow('Annotation image too large');
});

test('worker validation rejects invalid annotation dimensions', () => {
    expect(() => validatePayload(createPayload({
        version: 1,
        image: {
            dataUrl: PNG_DATA_URL,
            width: 0,
            height: 1,
            generatedAt: 1
        },
        viewport: {
            width: 960,
            height: 360
        }
    }), 1024)).toThrow('Invalid annotation image width');
});

test('worker validation allows payloads up to the 2 MB cap', () => {
    const payload = {
        videoId: 'abcDEF12345',
        title: 'Large Share Payload',
        notes: Array.from({ length: 500 }, (_value, index) => ({
            timestamp: index,
            text: `note-${index}-${'x'.repeat(1200)}`
        }))
    };

    const rawSize = getRawSize(payload);
    expect(rawSize).toBeGreaterThan(256 * 1024);
    expect(rawSize).toBeLessThan(2 * 1024 * 1024);
    expect(validatePayload(payload, rawSize).notes).toHaveLength(500);
});

test('worker validation accepts drawing-only notes with empty text', () => {
    const payload = createPayload({
        version: 1,
        image: {
            dataUrl: PNG_DATA_URL,
            width: 1,
            height: 1,
            generatedAt: 1_700_000_000_000
        },
        viewport: {
            width: 960,
            height: 360
        }
    });
    const notes = payload.notes as Array<Record<string, unknown>>;
    if (notes[0]) {
        notes[0].text = '';
    }

    const validated = validatePayload(payload, getRawSize(payload));

    expect(validated.notes[0]?.text).toBe('');
    expect(validated.notes[0]?.annotation?.image.dataUrl).toBe(PNG_DATA_URL);
});

test('worker validation rejects notes with neither text nor drawing', () => {
    const payload = {
        videoId: 'abcDEF12345',
        title: 'Worker Validation Video',
        notes: [
            {
                timestamp: 12,
                text: ''
            }
        ]
    };

    expect(() => validatePayload(payload, getRawSize(payload))).toThrow('Invalid note text');
});

test('worker stops reading request bodies once they exceed the payload cap', async () => {
    const request = new Request('https://example.test/api/share', {
        method: 'POST',
        body: 'x'.repeat(MAX_PAYLOAD_BYTES + 1)
    });

    await expect(readBoundedRequestText(request)).rejects.toThrow('Payload too large');
});

test('worker advertises the annotation share contract', async () => {
    const response = await worker.fetch(
        new Request('https://share-api.example.test/api/capabilities'),
        {} as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
        apiVersion: 2,
        annotations: {
            version: 1,
            maxImageBytes: 300 * 1024,
            maxPayloadBytes: 2 * 1024 * 1024
        }
    });
});
