import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';
import { createMockYoutubeWatchPage } from './mock-youtube';

const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ENABLED_STORAGE_KEY = 'videoNotes:enabled';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
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

    await tooltip.locator('textarea').fill(NOTE_TEXT);
    await tooltip.getByRole('button', { name: 'Save' }).click();

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
