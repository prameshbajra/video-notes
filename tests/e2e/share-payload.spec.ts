import { expect, test } from '@playwright/test';
import {
    MAX_SHARE_ANNOTATION_IMAGE_BYTES,
    MAX_SHARE_PAYLOAD_BYTES,
    assertSharePayloadIsValid
} from '../../extension/share-payload';
import {
    MAX_ANNOTATION_IMAGE_BYTES,
    MAX_PAYLOAD_BYTES
} from '../../worker/src/utils/validation';

const createAnnotation = (base64Length: number) => ({
    version: 1,
    image: {
        dataUrl: `data:image/png;base64,iVBORw0KGgo${'A'.repeat(base64Length)}`,
        width: 960,
        height: 540,
        generatedAt: 1_700_000_000_000
    },
    viewport: {
        width: 960,
        height: 540
    }
});

test('extension and Worker share limits stay in sync', () => {
    expect(MAX_SHARE_PAYLOAD_BYTES).toBe(MAX_PAYLOAD_BYTES);
    expect(MAX_SHARE_ANNOTATION_IMAGE_BYTES).toBe(MAX_ANNOTATION_IMAGE_BYTES);
});

test('client validation rejects an oversized annotation before submission', () => {
    const payload = {
        notes: [{ annotation: createAnnotation(410_000) }]
    };

    expect(() => assertSharePayloadIsValid(payload)).toThrow(
        'An annotation image is larger than 300 KB. Simplify the drawing and try again.'
    );
});

test('client validation rejects a multi-annotation payload over 2 MB', () => {
    const payload = {
        notes: Array.from({ length: 6 }, () => ({
            annotation: createAnnotation(390_000)
        }))
    };

    expect(() => assertSharePayloadIsValid(payload)).toThrow(
        'This share is larger than 2 MB. Remove some annotations and try again.'
    );
});
