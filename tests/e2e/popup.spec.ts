import { expect, test } from './fixtures';

const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ENABLED_STORAGE_KEY = 'videoNotes:enabled';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const DELETE_HOLD_ENABLED_STORAGE_KEY = 'videoNotes:deleteHoldEnabled';
const MD_EXPORT_ENABLED_STORAGE_KEY = 'videoNotes:mdExportEnabled';
const MD_TEMPLATE_STORAGE_KEY = 'videoNotes:mdTemplate';
const NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY = 'videoNotes:newTabFlashcardsEnabled';
const GEMINI_API_KEY_STORAGE_KEY = 'videoNotes:geminiApiKey';
const VIDEO_ID = 'e2e-popup-video';

const createPopupNotesSeed = (title = 'Popup Smoke Video'): Record<string, unknown> => ({
    [NOTES_STORAGE_KEY]: {
        [VIDEO_ID]: [
            {
                id: 'first-note',
                timestamp: 42,
                text: 'First automated note',
                createdAt: 1_700_000_000_000,
                updatedAt: 1_700_000_000_000
            },
            {
                id: 'second-note',
                timestamp: 125,
                text: 'Second searchable note',
                createdAt: 1_700_000_000_100,
                updatedAt: 1_700_000_000_100
            }
        ]
    },
    [METADATA_STORAGE_KEY]: {
        [VIDEO_ID]: {
            title,
            noteCount: 2,
            updatedAt: 1_700_000_000_100
        }
    }
});

test('popup lists stored notes, filters them, and persists settings changes', async ({
    getExtensionStorage,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    await seedExtensionStorage({
        ...createPopupNotesSeed(),
        [DELETE_HOLD_ENABLED_STORAGE_KEY]: false
    });

    await page.goto(popupUrl);

    await expect(page.getByRole('heading', { name: 'Video Notes' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Popup Smoke Video.*2 notes/ })).toBeVisible();
    await expect(page.getByText('First automated note')).toBeVisible();
    await expect(page.getByText('Second searchable note')).toBeVisible();
    await expect(page.getByText('00:42')).toBeVisible();
    await expect(page.getByText('02:05')).toBeVisible();

    await page.getByPlaceholder('Search videos or notes').fill('second');
    await expect(page.getByText('Second searchable note')).toBeVisible();
    await expect(page.getByText('First automated note')).toBeHidden();

    await page.getByPlaceholder('Search videos or notes').fill('does-not-exist');
    await expect(page.getByText('No matches for "does-not-exist".')).toBeVisible();

    await page.getByLabel('Open settings').click();
    await page.locator('#enable-notes-toggle').uncheck();
    await page.locator('#zen-mode-toggle').check();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([ENABLED_STORAGE_KEY, ZEN_MODE_STORAGE_KEY]);
        return {
            isEnabled: storage[ENABLED_STORAGE_KEY],
            isZenModeEnabled: storage[ZEN_MODE_STORAGE_KEY]
        };
    }).toEqual({
        isEnabled: false,
        isZenModeEnabled: true
    });
});

test('popup onboards a Gemini key when enabling new-tab flashcards', async ({
    getExtensionStorage,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    await seedExtensionStorage({});

    await page.goto(popupUrl);
    await page.getByLabel('Open settings').click();

    await expect(page.locator('#flashcards-key-section')).toBeHidden();

    await page.locator('#newtab-flashcards-toggle').check();
    await expect(page.locator('#flashcards-key-prompt')).toBeVisible();
    await expect(page.locator('#flashcards-key-status')).toBeHidden();

    await page.locator('#flashcards-key-cancel').click();
    await expect(page.locator('#newtab-flashcards-toggle')).not.toBeChecked();
    await expect(page.locator('#flashcards-key-section')).toBeHidden();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY);
        return storage[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY];
    }).toBe(false);

    await page.locator('#newtab-flashcards-toggle').check();
    await page.locator('#flashcards-key-input').fill('test-gemini-key');
    await page.locator('#flashcards-key-save').click();

    await expect(page.locator('#flashcards-key-status')).toBeVisible();
    await expect(page.locator('#flashcards-key-prompt')).toBeHidden();
    await expect(page.locator('#newtab-flashcards-toggle')).toBeChecked();
    await expect(page.locator('#flashcards-toggle')).not.toBeChecked();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([
            NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY,
            GEMINI_API_KEY_STORAGE_KEY
        ]);
        return {
            newTabFlashcardsEnabled: storage[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY],
            geminiApiKey: storage[GEMINI_API_KEY_STORAGE_KEY]
        };
    }).toEqual({
        newTabFlashcardsEnabled: true,
        geminiApiKey: 'test-gemini-key'
    });
});

test('popup deletes individual notes and whole videos', async ({
    getExtensionStorage,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    await seedExtensionStorage({
        ...createPopupNotesSeed('Delete Flow Video'),
        [DELETE_HOLD_ENABLED_STORAGE_KEY]: true
    });

    await page.goto(popupUrl);
    await expect(page.getByText('First automated note')).toBeVisible();

    await page.getByLabel('Open settings').click();
    await page.locator('#delete-hold-toggle').uncheck();
    await expect.poll(async () => {
        const storage = await getExtensionStorage(DELETE_HOLD_ENABLED_STORAGE_KEY);
        return storage[DELETE_HOLD_ENABLED_STORAGE_KEY];
    }).toBe(false);
    await page.getByRole('button', { name: /back/i }).click();

    await page.getByLabel('Delete note at 00:42').click();
    await expect(page.getByText('First automated note')).toBeHidden();
    await expect(page.getByText('Second searchable note')).toBeVisible();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([NOTES_STORAGE_KEY, METADATA_STORAGE_KEY]);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ id?: string }>>;
        const metadataPayload = storage[METADATA_STORAGE_KEY] as Record<string, { noteCount?: number }>;
        return {
            noteIds: (notesPayload[VIDEO_ID] || []).map((note) => note.id),
            noteCount: metadataPayload[VIDEO_ID]?.noteCount
        };
    }).toEqual({
        noteIds: ['second-note'],
        noteCount: 1
    });

    await page.locator('.video-header-row').hover();
    await page.getByLabel('Delete all notes for "Delete Flow Video"').click();
    await expect(page.getByText('You have not saved any notes yet.')).toBeVisible();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([NOTES_STORAGE_KEY, METADATA_STORAGE_KEY]);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, unknown>;
        const metadataPayload = storage[METADATA_STORAGE_KEY] as Record<string, unknown>;
        return {
            hasNotes: Object.prototype.hasOwnProperty.call(notesPayload, VIDEO_ID),
            hasMetadata: Object.prototype.hasOwnProperty.call(metadataPayload, VIDEO_ID)
        };
    }).toEqual({
        hasNotes: false,
        hasMetadata: false
    });
});

test('popup copies a video as markdown with the configured template', async ({
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    const template = '# *video-title*\n*youtube-url*\n\n- *time-url* — *note*';
    await seedExtensionStorage({
        ...createPopupNotesSeed('Markdown Video'),
        [MD_EXPORT_ENABLED_STORAGE_KEY]: true,
        [MD_TEMPLATE_STORAGE_KEY]: template
    });

    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (text: string): Promise<void> => {
                    (window as unknown as { __copiedText?: string }).__copiedText = text;
                }
            }
        });
    });

    await page.goto(popupUrl);
    await page.locator('.video-header-row').hover();
    await page.getByLabel('Copy notes for "Markdown Video" as markdown').click();

    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __copiedText?: string }).__copiedText || null
    )).toBe(
        '# Markdown Video\n' +
        'https://www.youtube.com/watch?v=e2e-popup-video\n\n' +
        '- [00:42](https://www.youtube.com/watch?v=e2e-popup-video&t=42s) — First automated note\n' +
        '- [02:05](https://www.youtube.com/watch?v=e2e-popup-video&t=125s) — Second searchable note'
    );
    await expect(page.getByText('Markdown copied to clipboard!')).toBeVisible();
});

test('popup imports a backup and merges notes without duplicating existing notes', async ({
    getExtensionStorage,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    await seedExtensionStorage({
        [NOTES_STORAGE_KEY]: {
            'existing-video': [
                {
                    id: 'existing-note',
                    timestamp: 12,
                    text: 'Already here',
                    createdAt: 1,
                    updatedAt: 1
                }
            ]
        },
        [METADATA_STORAGE_KEY]: {
            'existing-video': {
                title: 'Existing Video',
                noteCount: 1,
                updatedAt: 1
            }
        }
    });

    const backupPayload = {
        notes: {
            'existing-video': [
                {
                    id: 'existing-note',
                    timestamp: 12,
                    text: 'Already here',
                    createdAt: 1,
                    updatedAt: 1
                },
                {
                    id: 'imported-note',
                    timestamp: 34,
                    text: 'Imported into existing video',
                    createdAt: 2,
                    updatedAt: 2
                }
            ],
            'new-video': [
                {
                    id: 'new-video-note',
                    timestamp: 56,
                    text: 'Imported new video note',
                    createdAt: 3,
                    updatedAt: 3
                }
            ]
        },
        metadata: {
            'existing-video': {
                title: 'Existing Video From Backup',
                noteCount: 2,
                updatedAt: 2
            },
            'new-video': {
                title: 'New Imported Video',
                noteCount: 1,
                updatedAt: 3
            }
        },
        exportedAt: new Date().toISOString()
    };

    await page.goto(popupUrl);
    await page.getByLabel('Open settings').click();
    await page.locator('#import-input').setInputFiles({
        name: 'video-notes-backup.json',
        mimeType: 'application/json',
        buffer: Buffer.from(JSON.stringify(backupPayload))
    });

    await expect(page.getByText('Backup imported successfully.')).toBeVisible();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([NOTES_STORAGE_KEY, METADATA_STORAGE_KEY]);
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<string, Array<{ id?: string }>>;
        const metadataPayload = storage[METADATA_STORAGE_KEY] as Record<string, { noteCount?: number; title?: string }>;
        return {
            existingIds: (notesPayload['existing-video'] || []).map((note) => note.id),
            newIds: (notesPayload['new-video'] || []).map((note) => note.id),
            existingNoteCount: metadataPayload['existing-video']?.noteCount,
            newTitle: metadataPayload['new-video']?.title
        };
    }).toEqual({
        existingIds: ['existing-note', 'imported-note'],
        newIds: ['new-video-note'],
        existingNoteCount: 2,
        newTitle: 'New Imported Video'
    });
});
