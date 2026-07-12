import type { Page } from '@playwright/test';
import { expect, test } from './fixtures';

const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ENABLED_STORAGE_KEY = 'videoNotes:enabled';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const ANNOTATIONS_ENABLED_STORAGE_KEY = 'videoNotes:annotationsEnabled';
const DELETE_HOLD_ENABLED_STORAGE_KEY = 'videoNotes:deleteHoldEnabled';
const MD_EXPORT_ENABLED_STORAGE_KEY = 'videoNotes:mdExportEnabled';
const MD_TEMPLATE_STORAGE_KEY = 'videoNotes:mdTemplate';
const MD_TEMPLATE_VERSION_STORAGE_KEY = 'videoNotes:mdTemplateVersion';
const NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY = 'videoNotes:newTabFlashcardsEnabled';
const GEMINI_API_KEY_STORAGE_KEY = 'videoNotes:geminiApiKey';
const VIDEO_ID = 'e2e-popup-video';
const LARGE_LIBRARY_VIDEO_COUNT = 80;
const LARGE_LIBRARY_NOTES_PER_VIDEO = 80;
const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
const LEGACY_DEFAULT_MD_TEMPLATE = '[*video-title*](*youtube-url*)\n\n- *time-url*: *note*';
const DEFAULT_MD_TEMPLATE = `${LEGACY_DEFAULT_MD_TEMPLATE}\n*annotation-image*`;

const createRealisticPngDataUrl = async (page: Page): Promise<string> => page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 960;
    canvas.height = 540;
    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error('Canvas context unavailable');
    }

    context.strokeStyle = '#ff0033';
    context.lineWidth = 10;
    context.strokeRect(120, 90, 430, 260);
    context.beginPath();
    context.moveTo(140, 390);
    context.lineTo(760, 140);
    context.stroke();
    context.fillStyle = '#00aaff';
    context.font = 'bold 48px sans-serif';
    context.fillText('Important', 580, 420);
    return canvas.toDataURL('image/png');
});

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

const createLargeLibrarySeed = (): Record<string, unknown> => {
    const notes: Record<string, Array<Record<string, unknown>>> = {};
    const metadata: Record<string, Record<string, unknown>> = {};
    const now = 1_700_000_000_000;

    Array.from({ length: LARGE_LIBRARY_VIDEO_COUNT }, (_videoValue, videoIndex) => {
        const videoId = `large-library-video-${videoIndex.toString().padStart(3, '0')}`;
        notes[videoId] = Array.from({ length: LARGE_LIBRARY_NOTES_PER_VIDEO }, (_noteValue, noteIndex) => ({
            id: `${videoId}-note-${noteIndex.toString().padStart(3, '0')}`,
            timestamp: noteIndex * 15,
            text: `large-search-token note ${noteIndex} for video ${videoIndex}`,
            createdAt: now + noteIndex,
            updatedAt: now + noteIndex
        }));
        metadata[videoId] = {
            title: `Large Library Video ${videoIndex.toString().padStart(3, '0')}`,
            noteCount: LARGE_LIBRARY_NOTES_PER_VIDEO,
            updatedAt: now - videoIndex
        };
    });

    return {
        [NOTES_STORAGE_KEY]: notes,
        [METADATA_STORAGE_KEY]: metadata,
        [DELETE_HOLD_ENABLED_STORAGE_KEY]: false
    };
};

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
    await expect(page.locator('#annotations-toggle')).toBeChecked();
    await page.locator('#annotations-toggle').uncheck();

    await expect.poll(async () => {
        const storage = await getExtensionStorage([
            ENABLED_STORAGE_KEY,
            ZEN_MODE_STORAGE_KEY,
            ANNOTATIONS_ENABLED_STORAGE_KEY
        ]);
        return {
            isEnabled: storage[ENABLED_STORAGE_KEY],
            isZenModeEnabled: storage[ZEN_MODE_STORAGE_KEY],
            isAnnotationsEnabled: storage[ANNOTATIONS_ENABLED_STORAGE_KEY]
        };
    }).toEqual({
        isEnabled: false,
        isZenModeEnabled: true,
        isAnnotationsEnabled: false
    });
});

test('popup marks annotated notes with a drawing badge', async ({
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    const seed = createPopupNotesSeed('Annotated Badge Video');
    const notesPayload = seed[NOTES_STORAGE_KEY] as Record<string, Array<Record<string, unknown>>>;
    const firstNote = notesPayload[VIDEO_ID]?.[0];
    if (firstNote) {
        firstNote.annotation = {
            version: 1,
            scene: { version: '7.4.0', objects: [] },
            image: {
                dataUrl: PNG_DATA_URL,
                width: 1,
                height: 1,
                generatedAt: 1_700_000_000_200
            },
            viewport: {
                width: 960,
                height: 360
            }
        };
    }

    await seedExtensionStorage(seed);
    await page.goto(popupUrl);

    const badge = page.locator('.note-annotation-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText('Drawing');
    await expect(
        page.locator('.note-button', { hasText: 'First automated note' }).locator('.note-annotation-badge')
    ).toBeVisible();
});

test('popup keeps large note libraries paginated instead of rendering every note', async ({
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    await seedExtensionStorage(createLargeLibrarySeed());

    await page.goto(popupUrl);

    await expect(page.locator('.video-item')).toHaveCount(50);
    await expect(page.locator('.note-item')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Show more videos' })).toBeVisible();

    await page.getByRole('button', { name: /Large Library Video 000.*80 notes/ }).click();
    await expect(page.locator('.note-item')).toHaveCount(50);
    await expect(page.getByRole('button', { name: 'Show more notes for "Large Library Video 000"' })).toBeVisible();

    await page.getByRole('button', { name: 'Show more notes for "Large Library Video 000"' }).click();
    await expect(page.locator('.note-item')).toHaveCount(80);

    await page.getByPlaceholder('Search videos or notes').fill('large-search-token');
    await expect(page.locator('.video-item')).toHaveCount(50);
    await expect(page.locator('.note-item')).toHaveCount(2500);
    await expect(page.getByRole('button', { name: 'Show more videos' })).toBeVisible();
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

test('popup markdown export emits annotation images when the template requests them', async ({
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    const realisticPngDataUrl = await createRealisticPngDataUrl(page);
    const seed = createPopupNotesSeed('Markdown Annotation Video');
    const notesPayload = seed[NOTES_STORAGE_KEY] as Record<string, Array<Record<string, unknown>>>;
    const firstNote = notesPayload[VIDEO_ID]?.[0];
    if (firstNote) {
        firstNote.annotation = {
            version: 1,
            scene: { version: '7.4.0', objects: [] },
            image: {
                dataUrl: realisticPngDataUrl,
                width: 960,
                height: 540,
                generatedAt: 1_700_000_000_200
            },
            viewport: {
                width: 960,
                height: 360
            }
        };
    }

    await seedExtensionStorage({
        ...seed,
        [MD_EXPORT_ENABLED_STORAGE_KEY]: true,
        [MD_TEMPLATE_STORAGE_KEY]: '- *time-url*: *note*\n*annotation-image*'
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
    await page.getByLabel('Copy notes for "Markdown Annotation Video" as markdown').click();

    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __copiedText?: string }).__copiedText || null
    )).toBe(
        '- [00:42](https://www.youtube.com/watch?v=e2e-popup-video&t=42s): First automated note\n' +
        `![annotation](${realisticPngDataUrl})\n` +
        '- [02:05](https://www.youtube.com/watch?v=e2e-popup-video&t=125s): Second searchable note'
    );
});

test('popup migrates the legacy markdown template and exports drawing-only notes without display text', async ({
    getExtensionStorage,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    const seed = createPopupNotesSeed('Migrated Markdown Video');
    const notesPayload = seed[NOTES_STORAGE_KEY] as Record<string, Array<Record<string, unknown>>>;
    const firstNote = notesPayload[VIDEO_ID]?.[0];
    if (firstNote) {
        firstNote.text = '';
        firstNote.annotation = {
            version: 1,
            scene: { version: '7.4.0', objects: [] },
            image: {
                dataUrl: PNG_DATA_URL,
                width: 960,
                height: 540,
                generatedAt: 1_700_000_000_200
            },
            viewport: {
                width: 960,
                height: 540
            }
        };
    }

    await seedExtensionStorage({
        ...seed,
        [MD_EXPORT_ENABLED_STORAGE_KEY]: true,
        [MD_TEMPLATE_STORAGE_KEY]: LEGACY_DEFAULT_MD_TEMPLATE
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
    await expect.poll(async () => {
        const storage = await getExtensionStorage([
            MD_TEMPLATE_STORAGE_KEY,
            MD_TEMPLATE_VERSION_STORAGE_KEY
        ]);
        return {
            template: storage[MD_TEMPLATE_STORAGE_KEY],
            version: storage[MD_TEMPLATE_VERSION_STORAGE_KEY]
        };
    }).toEqual({ template: DEFAULT_MD_TEMPLATE, version: 2 });

    await page.locator('.video-header-row').hover();
    await page.getByLabel('Copy notes for "Migrated Markdown Video" as markdown').click();
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __copiedText?: string }).__copiedText || null
    )).not.toBeNull();
    const copiedText = await page.evaluate(() =>
        (window as unknown as { __copiedText?: string }).__copiedText || ''
    );
    expect(copiedText).not.toContain('(No text)');
    expect(copiedText).toContain(`![annotation](${PNG_DATA_URL})`);
});

test('popup preserves custom markdown templates while recording the current template version', async ({
    getExtensionStorage,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    const customTemplate = '# *video-title*\n\n*note*';
    await seedExtensionStorage({
        ...createPopupNotesSeed('Custom Markdown Video'),
        [MD_TEMPLATE_STORAGE_KEY]: customTemplate
    });

    await page.goto(popupUrl);
    await expect.poll(async () => {
        const storage = await getExtensionStorage([
            MD_TEMPLATE_STORAGE_KEY,
            MD_TEMPLATE_VERSION_STORAGE_KEY
        ]);
        return {
            template: storage[MD_TEMPLATE_STORAGE_KEY],
            version: storage[MD_TEMPLATE_VERSION_STORAGE_KEY]
        };
    }).toEqual({ template: customTemplate, version: 2 });
});

test('popup share payload includes annotation image metadata when present', async ({
    context,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    const seed = createPopupNotesSeed('Share Annotation Video');
    const notesPayload = seed[NOTES_STORAGE_KEY] as Record<string, Array<Record<string, unknown>>>;
    const firstNote = notesPayload[VIDEO_ID]?.[0];
    if (firstNote) {
        firstNote.text = '';
        firstNote.annotation = {
            version: 1,
            scene: { version: '7.4.0', objects: [] },
            image: {
                dataUrl: PNG_DATA_URL,
                width: 1,
                height: 1,
                generatedAt: 1_700_000_000_200
            },
            viewport: {
                width: 960,
                height: 360
            }
        };
    }

    await seedExtensionStorage(seed);
    await page.addInitScript(() => {
        Object.defineProperty(navigator, 'clipboard', {
            configurable: true,
            value: {
                writeText: async (_text: string): Promise<void> => {}
            }
        });
    });

    let capturedPayload: Record<string, unknown> | null = null;
    await context.route('https://share-api.video-notes.workers.dev/api/share', async (route) => {
        capturedPayload = route.request().postDataJSON() as Record<string, unknown>;
        await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({ id: 'share-id', url: 'https://example.test/share-id' })
        });
    });

    await page.goto(popupUrl);
    await page.locator('.video-header-row').hover();
    await page.getByLabel('Share notes for "Share Annotation Video"').click();

    await expect.poll(() => capturedPayload).not.toBeNull();
    const notes = capturedPayload?.notes as Array<{ text?: string; annotation?: SharedNoteAnnotation }> | undefined;
    expect(notes?.[0]?.text).toBe('');
    expect(notes?.[0]?.annotation?.image.dataUrl).toBe(PNG_DATA_URL);
    expect(notes?.[0]?.annotation?.viewport).toEqual({ width: 960, height: 360 });
    expect(notes?.[1]?.annotation).toBeUndefined();
});

test('popup surfaces the share API failure reason', async ({
    context,
    page,
    popupUrl,
    seedExtensionStorage
}) => {
    await seedExtensionStorage(createPopupNotesSeed('Share Error Video'));
    await context.route('https://share-api.video-notes.workers.dev/api/share', async (route) => {
        await route.fulfill({
            status: 413,
            contentType: 'application/json',
            body: JSON.stringify({ error: 'Payload too large' })
        });
    });

    await page.goto(popupUrl);
    await page.locator('.video-header-row').hover();
    await page.getByLabel('Share notes for "Share Error Video"').click();

    await expect(page.getByText('This share is larger than 2 MB. Remove some annotations and try again.'))
        .toBeVisible();
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
                    updatedAt: 2,
                    annotation: {
                        version: 1,
                        scene: { version: '7.4.0', objects: [] },
                        image: {
                            dataUrl: PNG_DATA_URL,
                            width: 1,
                            height: 1,
                            generatedAt: 4
                        },
                        viewport: {
                            width: 960,
                            height: 360
                        }
                    }
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
        const notesPayload = storage[NOTES_STORAGE_KEY] as Record<
            string,
            Array<{ id?: string; annotation?: { image?: { dataUrl?: string } } }>
        >;
        const metadataPayload = storage[METADATA_STORAGE_KEY] as Record<string, { noteCount?: number; title?: string }>;
        return {
            existingIds: (notesPayload['existing-video'] || []).map((note) => note.id),
            newIds: (notesPayload['new-video'] || []).map((note) => note.id),
            existingNoteCount: metadataPayload['existing-video']?.noteCount,
            newTitle: metadataPayload['new-video']?.title,
            importedAnnotation: notesPayload['existing-video']?.find((note) => note.id === 'imported-note')
                ?.annotation?.image?.dataUrl
        };
    }).toEqual({
        existingIds: ['existing-note', 'imported-note'],
        newIds: ['new-video-note'],
        existingNoteCount: 2,
        newTitle: 'New Imported Video',
        importedAnnotation: PNG_DATA_URL
    });
});
