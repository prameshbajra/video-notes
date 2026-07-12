import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createMockYoutubeWatchPage } from './mock-youtube';

const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ENABLED_STORAGE_KEY = 'videoNotes:enabled';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const ANNOTATIONS_ENABLED_STORAGE_KEY = 'videoNotes:annotationsEnabled';
const VIDEO_ID = 'e2e-content-video';
const NOTE_TEXT = 'A timestamped note from automation';

const openMockWatchPage = async (
    page: Page,
    videoId: string,
    options: { title?: string; durationSeconds?: number; currentTimeSeconds?: number } = {}
): Promise<void> => {
    const title = options.title || 'E2E Content Test Video';
    await page.route(`https://www.youtube.com/watch?v=${videoId}`, async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'text/html',
            body: createMockYoutubeWatchPage({
                title,
                durationSeconds: options.durationSeconds,
                currentTimeSeconds: options.currentTimeSeconds
            })
        });
    });

    await page.goto(`https://www.youtube.com/watch?v=${videoId}`, { waitUntil: 'domcontentloaded' });
    await page.locator('video.html5-main-video').waitFor();
    await page.evaluate(({ durationSeconds, currentTimeSeconds }) => {
        const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
        if (!video) {
            return;
        }
        Object.defineProperty(video, 'duration', {
            configurable: true,
            get: () => durationSeconds
        });
        video.currentTime = currentTimeSeconds;
        video.dispatchEvent(new Event('durationchange'));
    }, {
        durationSeconds: options.durationSeconds ?? 600,
        currentTimeSeconds: options.currentTimeSeconds ?? 0
    });
};

const openDrawingEditor = async (page: Page): Promise<void> => {
    // The editor module loads on demand after an explicit annotation action.
    await expect(page.locator('#video-notes-annotation-root')).toBeVisible();
};

const drawRectangleAnnotation = async (
    page: Page,
    start: { x: number; y: number } = { x: 150, y: 130 },
    end: { x: number; y: number } = { x: 290, y: 220 }
): Promise<void> => {
    await openDrawingEditor(page);
    await page.getByRole('button', { name: 'Annotation Rectangle' }).click();
    const box = await page.locator('#video-notes-annotation-root').boundingBox();
    expect(box).not.toBeNull();
    if (!box) {
        return;
    }

    await page.mouse.move(box.x + start.x, box.y + start.y);
    await page.mouse.down();
    await page.mouse.move(box.x + end.x, box.y + end.y);
    await page.mouse.up();
};

const delayContentStorageWrites = async (page: Page, delayMilliseconds: number): Promise<void> => {
    const session = await page.context().newCDPSession(page);
    const contentContextId = new Promise<number>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('Content script execution context not found')), 5_000);
        session.on('Runtime.executionContextCreated', ({ context }) => {
            if (context.name.startsWith('Video Notes')) {
                clearTimeout(timeout);
                resolve(context.id);
            }
        });
    });

    await session.send('Runtime.enable');
    const contextId = await contentContextId;
    await session.send('Runtime.evaluate', {
        contextId,
        expression: `(() => {
            const originalSet = chrome.storage.local.set.bind(chrome.storage.local);
            chrome.storage.local.set = (items, callback) => {
                window.setTimeout(() => originalSet(items, callback), ${delayMilliseconds});
            };
        })()`
    });
};

test.beforeEach(async ({ clearExtensionStorage }) => {
    await clearExtensionStorage();
});

test('content script creates and persists a timestamped note on a YouTube watch page', async ({
    getExtensionStorage,
    page
}) => {
    await openMockWatchPage(page, VIDEO_ID, {
        title: 'E2E Content Test Video',
        durationSeconds: 600,
        currentTimeSeconds: 65
    });

    await expect(page.locator('#video-notes-container')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Video Notes' })).toBeVisible();
    await expect(page.locator('#video-notes-track')).toBeVisible();

    await page.getByRole('button', { name: /add a note/i }).click();

    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('@ 01:05');

    const textarea = tooltip.locator('textarea');
    const addDrawingButton = tooltip.getByRole('button', { name: 'Create an annotation instead' });
    const cancelButton = tooltip.getByRole('button', { name: 'Cancel' });
    const saveButton = tooltip.getByRole('button', { name: 'Save' });
    await expect(addDrawingButton).toBeVisible();
    const tooltipBox = await tooltip.boundingBox();
    const textareaBox = await textarea.boundingBox();
    const addDrawingBox = await addDrawingButton.boundingBox();
    const cancelBox = await cancelButton.boundingBox();
    const saveBox = await saveButton.boundingBox();
    expect(tooltipBox).not.toBeNull();
    expect(textareaBox).not.toBeNull();
    expect(addDrawingBox).not.toBeNull();
    expect(cancelBox).not.toBeNull();
    expect(saveBox).not.toBeNull();
    if (tooltipBox && textareaBox && addDrawingBox && cancelBox && saveBox) {
        expect(tooltipBox.width).toBeCloseTo(380, 0);
        expect(textareaBox.height).toBeGreaterThanOrEqual(128);
        expect(addDrawingBox.x).toBeLessThan(cancelBox.x);
        expect(cancelBox.x).toBeLessThan(saveBox.x);
        const addDrawingCenterY = addDrawingBox.y + addDrawingBox.height / 2;
        const cancelCenterY = cancelBox.y + cancelBox.height / 2;
        const saveCenterY = saveBox.y + saveBox.height / 2;
        expect(addDrawingCenterY).toBeCloseTo(cancelCenterY, 0);
        expect(cancelCenterY).toBeCloseTo(saveCenterY, 0);
    }

    await textarea.fill(NOTE_TEXT);
    await saveButton.click();

    await expect(tooltip).toBeHidden();
    await expect(page.locator('#video-notes-track [data-note-id]')).toHaveCount(1);
    await expect(page.getByText('No notes yet')).toBeHidden();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ text?: string }>> | undefined;
        return notesPayload?.[VIDEO_ID]?.[0]?.text || null;
    }).toBe(NOTE_TEXT);

    const storage = await getExtensionStorage([NOTES_STORAGE_KEY, METADATA_STORAGE_KEY]);
    const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
        string,
        Array<{ text?: string; timestamp?: number }>
    >;
    const metadataPayload = storage[METADATA_STORAGE_KEY] as Record<string, { noteCount?: number; title?: string }>;
    const savedNote = notesPayload[VIDEO_ID]?.[0];

    expect(savedNote?.timestamp).toBe(65);
    expect(metadataPayload[VIDEO_ID]).toMatchObject({
        noteCount: 1,
        title: 'E2E Content Test Video'
    });
});

test('content script edits and deletes existing timeline notes', async ({
    getExtensionStorage,
    page,
    seedExtensionStorage
}) => {
    const videoId = 'e2e-content-edit-delete-video';
    await seedExtensionStorage({
        [NOTES_STORAGE_KEY]: {
            [videoId]: [
                {
                    id: 'seed-note-1',
                    timestamp: 10,
                    text: 'Original seeded note',
                    createdAt: 1_700_000_000_000,
                    updatedAt: 1_700_000_000_000
                },
                {
                    id: 'seed-note-2',
                    timestamp: 120,
                    text: 'Another seeded note',
                    createdAt: 1_700_000_000_100,
                    updatedAt: 1_700_000_000_100
                }
            ]
        },
        [METADATA_STORAGE_KEY]: {
            [videoId]: {
                title: 'Seeded Content Video',
                noteCount: 2,
                updatedAt: 1_700_000_000_100
            }
        }
    });

    await openMockWatchPage(page, videoId, {
        title: 'Seeded Content Video',
        durationSeconds: 240,
        currentTimeSeconds: 0
    });

    await expect(page.locator('#video-notes-track [data-note-id]')).toHaveCount(2);

    const originalDot = page.getByRole('button', { name: /View note at 00:10: Original seeded note/ });
    await originalDot.focus();
    await page.keyboard.press('Enter');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Edit note');
    await expect(tooltip.locator('textarea')).toHaveValue('Original seeded note');

    await tooltip.locator('textarea').fill('Edited seeded note');
    await tooltip.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByRole('button', { name: /View note at 00:10: Edited seeded note/ })).toBeVisible();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ id?: string; text?: string }>>;
        return notesPayload[videoId]?.find((note) => note.id === 'seed-note-1')?.text || null;
    }).toBe('Edited seeded note');

    const editedDot = page.getByRole('button', { name: /View note at 00:10: Edited seeded note/ });
    await editedDot.focus();
    await page.keyboard.press('Enter');
    await tooltip.getByRole('button', { name: 'Delete' }).click();

    await expect(page.locator('#video-notes-track [data-note-id]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /View note at 02:00: Another seeded note/ })).toBeVisible();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([NOTES_STORAGE_KEY, METADATA_STORAGE_KEY]);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ id?: string }>>;
        const metadataPayload = storage[METADATA_STORAGE_KEY] as Record<string, { noteCount?: number }>;
        return {
            noteIds: (notesPayload[videoId] || []).map((note) => note.id),
            noteCount: metadataPayload[videoId]?.noteCount
        };
    }).toEqual({
        noteIds: ['seed-note-2'],
        noteCount: 1
    });
});

test('content script responds to enabled and Zen mode storage changes', async ({
    page,
    seedExtensionStorage,
    setExtensionStorage
}) => {
    const videoId = 'e2e-content-settings-video';
    await seedExtensionStorage({
        [ENABLED_STORAGE_KEY]: false,
        [ZEN_MODE_STORAGE_KEY]: false
    });

    await openMockWatchPage(page, videoId, {
        title: 'Content Settings Video',
        durationSeconds: 180,
        currentTimeSeconds: 30
    });

    await expect(page.locator('#video-notes-container')).toHaveCount(0);

    await setExtensionStorage({ [ENABLED_STORAGE_KEY]: true });
    await expect(page.locator('#video-notes-container')).toBeVisible();

    const annotateButton = page.getByRole('button', { name: 'Annotate the video at the current moment' });
    await expect(annotateButton).toBeVisible();
    await setExtensionStorage({ [ANNOTATIONS_ENABLED_STORAGE_KEY]: false });
    await expect(annotateButton).toBeHidden();
    await page.keyboard.press('Alt+KeyA');
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await setExtensionStorage({ [ANNOTATIONS_ENABLED_STORAGE_KEY]: true });
    await expect(annotateButton).toBeVisible();

    await setExtensionStorage({ [ZEN_MODE_STORAGE_KEY]: true });
    await expect.poll(async () => page.locator('#video-notes-zen-style').evaluate((element) =>
        element.textContent || ''
    )).toContain('#secondary');
    await expect(page.locator('ytd-watch-flexy')).toHaveAttribute('theater', '');

    await setExtensionStorage({ [ZEN_MODE_STORAGE_KEY]: false });
    await expect(page.locator('#video-notes-zen-style')).toHaveCount(0);
    await expect(page.locator('ytd-watch-flexy')).not.toHaveAttribute('theater', '');

    await setExtensionStorage({ [ENABLED_STORAGE_KEY]: false });
    await expect(page.locator('#video-notes-container')).toHaveCount(0);
});

test('content script opens the note editor from the Alt+N shortcut', async ({ getExtensionStorage, page }) => {
    const videoId = 'e2e-content-shortcut-video';
    await openMockWatchPage(page, videoId, {
        title: 'Shortcut Video',
        durationSeconds: 300,
        currentTimeSeconds: 90
    });

    await page.keyboard.press('Alt+KeyN');

    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await expect(tooltip.getByRole('button', { name: 'Create an annotation instead' })).toBeVisible();
    await expect(tooltip).toContainText('@ 01:30');

    await tooltip.locator('textarea').fill('Shortcut-created note');
    await tooltip.getByRole('button', { name: 'Save' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ text?: string; timestamp?: number }>>;
        const note = notesPayload[videoId]?.[0];
        return note ? `${note.timestamp}:${note.text}` : null;
    }).toBe('90:Shortcut-created note');
});

test('content script switches an unsaved text draft to a separate annotation', async ({
    getExtensionStorage,
    page,
    seedExtensionStorage
}) => {
    const videoId = 'e2e-content-annotation-video';
    await seedExtensionStorage({
        [ANNOTATIONS_ENABLED_STORAGE_KEY]: true
    });

    await openMockWatchPage(page, videoId, {
        title: 'Annotation Video',
        durationSeconds: 300,
        currentTimeSeconds: 33
    });

    await page.keyboard.press('Alt+KeyN');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();
    await tooltip.locator('textarea').fill('This draft must not be saved');
    await tooltip.getByRole('button', { name: 'Create an annotation instead' }).click();
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);
    await expect(page.getByText('Done or Ctrl/⌘↵ to save · Esc to cancel')).toBeVisible();
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{
                text?: string;
                annotation?: { image?: { dataUrl?: string }; scene?: { objects?: unknown[] } };
            }>
        >;
        const note = notesPayload[videoId]?.[0];
        return {
            text: note?.text,
            imagePrefix: note?.annotation?.image?.dataUrl?.slice(0, 22),
            objectCount: note?.annotation?.scene?.objects?.length || 0
        };
    }).toEqual({
        text: '',
        imagePrefix: 'data:image/png;base64,',
        objectCount: 1
    });

    await expect(page.getByRole('button', { name: /includes drawing/ })).toBeVisible();
});

test('content script hides drawing controls when annotations are disabled', async ({
    page,
    seedExtensionStorage
}) => {
    const videoId = 'e2e-content-annotation-disabled-video';
    await seedExtensionStorage({
        [ANNOTATIONS_ENABLED_STORAGE_KEY]: false
    });

    await openMockWatchPage(page, videoId, {
        title: 'Annotation Disabled Video',
        durationSeconds: 120,
        currentTimeSeconds: 5
    });

    await expect(page.getByRole('button', { name: 'Annotate the video at the current moment' })).toHaveCount(0);
    await page.keyboard.press('Alt+KeyA');
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);

    await page.keyboard.press('Alt+KeyN');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();

    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);

    await tooltip.locator('textarea').fill('Plain note while drawing is off');
    await tooltip.getByRole('button', { name: 'Save' }).click();
    await expect(tooltip).toBeHidden();
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
});

test('content script saves a drawing-only note from the Done button', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-done-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Done Video',
        durationSeconds: 240,
        currentTimeSeconds: 12
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);

    await page.getByRole('button', { name: 'Annotation Done' }).click();
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await expect(tooltip).toBeHidden();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ text?: string; annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        const note = notesPayload[videoId]?.[0];
        return {
            text: note?.text,
            objectCount: note?.annotation?.scene?.objects?.length || 0
        };
    }).toEqual({
        text: '',
        objectCount: 1
    });

    await expect(page.getByRole('button', { name: /includes drawing/ })).toBeVisible();
});

test('content script shares drawing-only annotations with raw empty text', async ({
    context,
    page
}) => {
    const videoId = 'e2e-share01';
    let capturedPayload: Record<string, unknown> | null = null;
    await context.route('https://share-api.video-notes.workers.dev/api/share', async (route) => {
        capturedPayload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'share-id', url: 'https://example.test/share-id' })
        });
    });
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (_text: string): Promise<void> => {}
            }
        });
    });

    await openMockWatchPage(page, videoId, {
        title: 'Drawing Share Video',
        durationSeconds: 240,
        currentTimeSeconds: 12
    });
    await page.keyboard.press('Alt+KeyA');
    await drawRectangleAnnotation(page);
    await page.getByRole('button', { name: 'Annotation Done' }).click();
    await page.getByRole('button', { name: 'Share notes for this video' }).click();

    await expect.poll(() => capturedPayload).not.toBeNull();
    const notes = capturedPayload?.notes as Array<{
        text?: string;
        annotation?: { image?: { dataUrl?: string } };
    }> | undefined;
    expect(notes?.[0]?.text).toBe('');
    expect(notes?.[0]?.annotation?.image?.dataUrl).toContain('data:image/png;base64,');
});

test('content script saves a drawing-only note with the Cmd+Enter shortcut', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-shortcut-save-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Shortcut Save Video',
        durationSeconds: 240,
        currentTimeSeconds: 8
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);

    await page.keyboard.press('ControlOrMeta+Enter');
    await expect(tooltip).toBeHidden();
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ text?: string; annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        const note = notesPayload[videoId]?.[0];
        return {
            text: note?.text,
            objectCount: note?.annotation?.scene?.objects?.length || 0
        };
    }).toEqual({
        text: '',
        objectCount: 1
    });
});

test('content script discards the drawing session with Escape', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-escape-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Escape Video',
        durationSeconds: 240,
        currentTimeSeconds: 8
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);

    await page.keyboard.press('Escape');
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await expect(tooltip).toBeHidden();

    const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
    const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, unknown[]> | undefined;
    expect(notesPayload?.[videoId] || []).toHaveLength(0);
});

test('content script keeps the drawing session when clicking outside the editor', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-outside-click-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Outside Click Video',
        durationSeconds: 240,
        currentTimeSeconds: 21
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);

    await page.locator('#comments').click({ position: { x: 5, y: 5 } });
    await expect(page.locator('#video-notes-annotation-root')).toBeVisible();
    await expect(tooltip).toBeHidden();

    await page.getByRole('button', { name: 'Annotation Done' }).click();
    await expect(tooltip).toBeHidden();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ text?: string; annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        const note = notesPayload[videoId]?.[0];
        return {
            text: note?.text,
            objectCount: note?.annotation?.scene?.objects?.length || 0
        };
    }).toEqual({
        text: '',
        objectCount: 1
    });
});

test('content script closes an empty annotation on Done without saving it', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-empty-dismiss-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Empty Dismiss Video',
        durationSeconds: 240,
        currentTimeSeconds: 17
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await expect(page.locator('#video-notes-annotation-root')).toBeVisible();

    await page.getByRole('button', { name: 'Annotation Done' }).click();
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await expect(tooltip).toBeHidden();

    const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
    const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, unknown[]> | undefined;
    expect(notesPayload?.[videoId] || []).toHaveLength(0);
});

test('content script supports undo and redo shortcuts while drawing', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-undo-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Undo Video',
        durationSeconds: 240,
        currentTimeSeconds: 30
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();

    await openDrawingEditor(page);
    const root = page.locator('#video-notes-annotation-root');
    await expect(page.getByRole('button', { name: 'Annotation Undo' })).toBeDisabled();
    await expect(page.getByRole('button', { name: 'Annotation Redo' })).toBeDisabled();

    await drawRectangleAnnotation(page);
    await drawRectangleAnnotation(page, { x: 360, y: 130 }, { x: 500, y: 220 });
    await expect(root).toHaveAttribute('data-annotation-objects', '2');
    await expect(page.getByRole('button', { name: 'Annotation Undo' })).toBeEnabled();

    await page.keyboard.press('ControlOrMeta+z');
    await expect(root).toHaveAttribute('data-annotation-objects', '1');
    await expect(page.getByRole('button', { name: 'Annotation Redo' })).toBeEnabled();

    await page.keyboard.press('ControlOrMeta+Shift+z');
    await expect(root).toHaveAttribute('data-annotation-objects', '2');

    await page.keyboard.press('ControlOrMeta+z');
    await expect(root).toHaveAttribute('data-annotation-objects', '1');

    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.[0]?.annotation?.scene?.objects?.length || 0;
    }).toBe(1);
});

test('content script opens saved annotations directly in the canvas', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-direct-edit-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Direct Edit Video',
        durationSeconds: 240,
        currentTimeSeconds: 55
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.[0]?.annotation?.scene?.objects?.length || 0;
    }).toBe(1);

    await page.getByRole('button', { name: /View note at 00:55.*includes drawing/ }).click();
    await expect(tooltip).toBeHidden();
    const root = page.locator('#video-notes-annotation-root');
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute('data-annotation-objects', '1');

    await drawRectangleAnnotation(page, { x: 360, y: 130 }, { x: 500, y: 220 });
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.[0]?.annotation?.scene?.objects?.length || 0;
    }).toBe(2);

    await page.getByRole('button', { name: /View note at 00:55.*includes drawing/ }).click();
    await expect(page.getByRole('button', { name: 'Delete annotation note' })).toBeVisible();
    await page.getByRole('button', { name: 'Delete annotation note' }).click();
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
    await expect(page.locator('#video-notes-track [data-note-id]')).toHaveCount(0);
    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, unknown[]> | undefined;
        return notesPayload?.[videoId]?.length || 0;
    }).toBe(0);
});

test('content script cancels annotation edits before opening a note from the timeline', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-track-switch-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Track Switch Video',
        durationSeconds: 200,
        currentTimeSeconds: 20
    });

    await page.keyboard.press('Alt+KeyA');
    await drawRectangleAnnotation(page);
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await page.getByRole('button', { name: /View note at 00:20.*includes drawing/ }).click();
    const root = page.locator('#video-notes-annotation-root');
    await expect(root).toHaveAttribute('data-annotation-objects', '1');
    await drawRectangleAnnotation(page, { x: 360, y: 130 }, { x: 500, y: 220 });
    await expect(root).toHaveAttribute('data-annotation-objects', '2');

    const track = page.locator('#video-notes-track');
    await track.click({ position: { x: 700, y: 18 } });
    await expect(root).toHaveCount(0);
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText('Add a note');

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.[0]?.annotation?.scene?.objects?.length || 0;
    }).toBe(1);
});

test('content script switches directly between saved annotations', async ({
    getExtensionStorage,
    page
}) => {
    const videoId = 'e2e-content-annotation-dot-switch-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Dot Switch Video',
        durationSeconds: 200,
        currentTimeSeconds: 20
    });

    await page.keyboard.press('Alt+KeyA');
    await drawRectangleAnnotation(page);
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await page.evaluate(() => {
        const video = document.querySelector<HTMLVideoElement>('video.html5-main-video');
        if (video) {
            video.currentTime = 80;
        }
    });
    await page.keyboard.press('Alt+KeyA');
    await drawRectangleAnnotation(page, { x: 360, y: 130 }, { x: 500, y: 220 });
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    // The mock page's media duration is not visible in the extension's isolated
    // world, so both test markers render at the same position. Dispatch to the
    // older marker directly before exercising a real click on the newer one.
    await page.getByRole('button', { name: /View note at 00:20.*includes drawing/ }).dispatchEvent('click');
    const root = page.locator('#video-notes-annotation-root');
    await expect(root).toHaveAttribute('data-annotation-objects', '1');
    await drawRectangleAnnotation(page, { x: 520, y: 130 }, { x: 620, y: 220 });
    await expect(root).toHaveAttribute('data-annotation-objects', '2');

    await page.getByRole('button', { name: /View note at 01:20.*includes drawing/ }).click();
    await expect(root).toBeVisible();
    await expect(root).toHaveAttribute('data-annotation-objects', '1');
    await expect.poll(async () => page.locator('video.html5-main-video').evaluate((video) => (
        video as HTMLVideoElement
    ).currentTime)).toBe(80);

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.map((note) => note.annotation?.scene?.objects?.length || 0);
    }).toEqual([1, 1]);
});

test('content script keeps drawing actions out of the text-note editor', async ({
    page,
    seedExtensionStorage
}) => {
    const videoId = 'e2e-content-annotation-cancel-video';
    await seedExtensionStorage({
        [ANNOTATIONS_ENABLED_STORAGE_KEY]: true,
        [NOTES_STORAGE_KEY]: {
            [videoId]: [
                {
                    id: 'plain-note',
                    timestamp: 15,
                    text: 'Plain note',
                    createdAt: 1,
                    updatedAt: 1
                }
            ]
        },
        [METADATA_STORAGE_KEY]: {
            [videoId]: {
                title: 'Annotation Cancel Video',
                noteCount: 1,
                updatedAt: 1
            }
        }
    });

    await openMockWatchPage(page, videoId, {
        title: 'Annotation Cancel Video',
        durationSeconds: 120,
        currentTimeSeconds: 0
    });

    await page.getByRole('button', { name: /View note at 00:15: Plain note/ }).click();
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeVisible();
    await expect(tooltip.getByRole('button', { name: 'Create an annotation instead' })).toBeHidden();
    await expect(tooltip.getByRole('button', { name: /edit drawing/i })).toHaveCount(0);
    await expect(page.locator('#video-notes-annotation-root')).toHaveCount(0);
});

test('content script reloads annotations for edit and persists object eraser changes', async ({
    getExtensionStorage,
    page,
    seedExtensionStorage
}) => {
    const videoId = 'e2e-content-annotation-erase-video';
    await seedExtensionStorage({
        [ANNOTATIONS_ENABLED_STORAGE_KEY]: true
    });

    await openMockWatchPage(page, videoId, {
        title: 'Annotation Erase Video',
        durationSeconds: 180,
        currentTimeSeconds: 45
    });

    await page.keyboard.press('Alt+KeyA');
    const tooltip = page.locator('#video-notes-tooltip');
    await expect(tooltip).toBeHidden();
    await drawRectangleAnnotation(page);
    await drawRectangleAnnotation(page, { x: 360, y: 130 }, { x: 500, y: 220 });
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.[0]?.annotation?.scene?.objects?.length || 0;
    }).toBe(2);

    await page.getByRole('button', { name: /View note at 00:45.*includes drawing/ }).click();
    await expect(tooltip).toBeHidden();
    await openDrawingEditor(page);
    const root = page.locator('#video-notes-annotation-root');
    await expect(root).toHaveAttribute('data-annotation-objects', '2');
    await page.getByRole('button', { name: 'Annotation Eraser' }).click();
    const box = await root.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
        // Center of the second rectangle.
        await page.mouse.click(box.x + 430, box.y + 175);
    }
    await expect(root).toHaveAttribute('data-annotation-objects', '1');
    await page.getByRole('button', { name: 'Annotation Done' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ annotation?: { scene?: { objects?: unknown[] } } }>
        >;
        return notesPayload[videoId]?.[0]?.annotation?.scene?.objects?.length || 0;
    }).toBe(1);
});

test('content script lets the user move the drawing toolbar by its grip', async ({ page }) => {
    const videoId = 'e2e-content-annotation-toolbar-drag-video';
    await openMockWatchPage(page, videoId, {
        title: 'Annotation Toolbar Drag Video',
        durationSeconds: 240,
        currentTimeSeconds: 5
    });

    await page.keyboard.press('Alt+KeyA');
    await expect(page.locator('#video-notes-tooltip')).toBeHidden();
    const toolbar = page.locator('#video-notes-annotation-toolbar');
    await expect(toolbar).toBeVisible();

    const before = await toolbar.boundingBox();
    expect(before).not.toBeNull();
    const grip = page.getByLabel('Move toolbar');
    const gripBox = await grip.boundingBox();
    expect(gripBox).not.toBeNull();
    if (!before || !gripBox) {
        return;
    }

    await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
    await page.mouse.down();
    await page.mouse.move(gripBox.x + gripBox.width / 2 + 140, gripBox.y + gripBox.height / 2 + 90, { steps: 5 });
    await page.mouse.up();

    const after = await toolbar.boundingBox();
    expect(after).not.toBeNull();
    if (!after) {
        return;
    }

    expect(after.x).toBeGreaterThan(before.x + 100);
    expect(after.y).toBeGreaterThan(before.y + 50);
});

test('content script does not apply a completed save to a newly navigated video', async ({
    getExtensionStorage,
    page
}) => {
    const firstVideoId = 'save-race-a';
    const secondVideoId = 'save-race-b';
    await openMockWatchPage(page, firstVideoId, { currentTimeSeconds: 15 });
    await expect(page.locator('#video-notes-container')).toBeVisible();
    await delayContentStorageWrites(page, 300);

    await page.getByRole('button', { name: /add a note/i }).click();
    await page.locator('#video-notes-tooltip textarea').fill('Saved on the first video');
    await page.getByRole('button', { name: 'Save' }).click();

    await page.evaluate((videoId) => {
        window.history.pushState({}, '', `/watch?v=${videoId}`);
        const title = document.querySelector('#title');
        if (title) {
            title.textContent = 'Second Video';
        }
        window.dispatchEvent(new Event('yt-navigate-finish'));
    }, secondVideoId);

    await expect(page.locator('#video-notes-track [data-note-id]')).toHaveCount(0);
    await page.getByRole('button', { name: /add a note/i }).click();
    const secondSaveButton = page.getByRole('button', { name: 'Save' });
    await expect(secondSaveButton).toBeEnabled();
    await page.locator('#video-notes-tooltip textarea').fill('Saved on the second video');
    await secondSaveButton.click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
        const notes = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ text?: string }>> | undefined;
        return notes?.[firstVideoId]?.[0]?.text || null;
    }).toBe('Saved on the first video');
    await expect(page.locator('#video-notes-track [data-note-id]')).toHaveCount(1);

    const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
    const notes = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ text?: string }>>;
    expect(notes[secondVideoId]?.[0]?.text).toBe('Saved on the second video');
});

test('content script does not apply a completed delete to a newly navigated video', async ({
    getExtensionStorage,
    page,
    seedExtensionStorage
}) => {
    const firstVideoId = 'delete-race-a';
    const secondVideoId = 'delete-race-b';
    const createNote = (id: string, text: string) => ({
        id,
        timestamp: 10,
        text,
        createdAt: 1_700_000_000_000,
        updatedAt: 1_700_000_000_000
    });
    await seedExtensionStorage({
        [NOTES_STORAGE_KEY]: {
            [firstVideoId]: [createNote('first-note', 'Delete from first video')],
            [secondVideoId]: [createNote('second-note', 'Keep on second video')]
        }
    });
    await openMockWatchPage(page, firstVideoId);
    await expect(page.getByRole('button', { name: /Delete from first video/ })).toBeVisible();
    await delayContentStorageWrites(page, 300);

    await page.getByRole('button', { name: /Delete from first video/ }).click();
    await page.getByRole('button', { name: 'Delete', exact: true }).click();
    await page.waitForTimeout(50);
    await page.evaluate((videoId) => {
        window.history.pushState({}, '', `/watch?v=${videoId}`);
        window.dispatchEvent(new Event('yt-navigate-finish'));
    }, secondVideoId);

    await page.waitForTimeout(750);
    await expect(page.getByRole('button', { name: /Keep on second video/ })).toBeVisible();

    const storage = await getExtensionStorage(NOTES_STORAGE_KEY);
    const notes = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ id?: string }>>;
    expect(notes[secondVideoId]?.[0]?.id).toBe('second-note');
});

test('annotation editor draws shapes from touch input', async ({ page }) => {
    const session = await page.context().newCDPSession(page);
    await session.send('Emulation.setTouchEmulationEnabled', {
        enabled: true,
        maxTouchPoints: 1
    });
    await openMockWatchPage(page, 'touch-draw1', { currentTimeSeconds: 20 });
    await page.keyboard.press('Alt+KeyA');
    await openDrawingEditor(page);
    await page.getByRole('button', { name: 'Annotation Rectangle' }).click();

    const canvas = page.locator('#video-notes-annotation-root .upper-canvas');
    await canvas.evaluate((element) => {
        const box = element.getBoundingClientRect();
        const dispatchTouch = (type: string, x: number, y: number): void => {
            const touch = new Touch({
                identifier: 1,
                target: element,
                clientX: box.left + x,
                clientY: box.top + y
            });
            const activeTouches = type === 'touchend' ? [] : [touch];
            element.dispatchEvent(new TouchEvent(type, {
                bubbles: true,
                cancelable: true,
                touches: activeTouches,
                targetTouches: activeTouches,
                changedTouches: [touch]
            }));
        };

        dispatchTouch('touchstart', 120, 120);
        dispatchTouch('touchmove', 280, 220);
        dispatchTouch('touchend', 280, 220);
    });

    await expect(page.locator('#video-notes-annotation-root')).toHaveAttribute('data-annotation-objects', '1');
});

test('annotation toolbar stays within a narrow video player', async ({ page }) => {
    await openMockWatchPage(page, 'narrow-ui01', { currentTimeSeconds: 5 });
    await page.evaluate(() => {
        const player = document.getElementById('player');
        const primary = document.getElementById('primary-inner');
        if (player) {
            player.style.width = '480px';
        }
        if (primary) {
            primary.style.width = '480px';
        }
    });

    await page.keyboard.press('Alt+KeyA');
    await openDrawingEditor(page);
    const dimensions = await page.locator('#video-notes-annotation-toolbar').evaluate((toolbar) => {
        const root = document.getElementById('video-notes-annotation-root');
        const rootBox = root?.getBoundingClientRect();
        const toolbarBox = toolbar.getBoundingClientRect();
        return {
            rootLeft: rootBox?.left || 0,
            rootRight: rootBox?.right || 0,
            toolbarLeft: toolbarBox.left,
            toolbarRight: toolbarBox.right,
            clientWidth: toolbar.clientWidth,
            scrollWidth: toolbar.scrollWidth
        };
    });

    expect(dimensions.toolbarLeft).toBeGreaterThanOrEqual(dimensions.rootLeft);
    expect(dimensions.toolbarRight).toBeLessThanOrEqual(dimensions.rootRight);
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);
});
