import { expect, test } from './fixtures';

const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const FLASHCARDS_ENABLED_STORAGE_KEY = 'videoNotes:flashcardsEnabled';
const GEMINI_API_KEY_STORAGE_KEY = 'videoNotes:geminiApiKey';
const FLASHCARDS_CACHE_STORAGE_KEY = 'videoNotes:flashcardsCache';
const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const computeNoteIdsHash = (ids: string[]): string => {
    const sortedIds = ids.slice().sort();
    let hash = 5381;
    const combined = sortedIds.join('|');
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) + hash + combined.charCodeAt(i)) | 0;
    }
    return `${sortedIds.length}:${(hash >>> 0).toString(36)}`;
};

const createFlashcardNotes = (): Array<{
    id: string;
    timestamp: number;
    text: string;
    createdAt: number;
    updatedAt: number;
}> => Array.from({ length: 6 }, (_value, index) => ({
    id: `flashcard-note-${index + 1}`,
    timestamp: (index + 1) * 15,
    text: `Study note ${index + 1} with enough detail for a quiz`,
    createdAt: 1_700_000_000_000 + index,
    updatedAt: 1_700_000_000_000 + index
}));

test('notes page renders saved notes and prompts for a Gemini key when flashcards are enabled', async ({
    extensionId,
    getExtensionStorage,
    page,
    seedExtensionStorage
}) => {
    await seedExtensionStorage({
        [FLASHCARDS_ENABLED_STORAGE_KEY]: true,
        [NOTES_STORAGE_KEY]: {
            'notes-page-video': [
                {
                    id: 'notes-page-note',
                    timestamp: 88,
                    text: 'A note visible on the full notes page',
                    createdAt: 1,
                    updatedAt: 1
                }
            ]
        },
        [METADATA_STORAGE_KEY]: {
            'notes-page-video': {
                title: 'Notes Page Video',
                noteCount: 1,
                updatedAt: 1
            }
        }
    });

    await page.goto(`chrome-extension://${extensionId}/notes/notes.html`);

    await expect(page.getByRole('heading', { name: 'Saved notes' })).toBeVisible();
    await expect(page.getByText('Notes Page Video')).toBeVisible();
    await expect(page.getByText('A note visible on the full notes page')).toBeVisible();

    const panel = page.locator('#flashcards-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Add your Gemini API key');

    await page.locator('#flashcards-panel-key-input').fill('test-gemini-key');
    await panel.getByRole('button', { name: 'Save key' }).click();

    await expect.poll(async () => {
        const storage = await getExtensionStorage(GEMINI_API_KEY_STORAGE_KEY);
        return storage[GEMINI_API_KEY_STORAGE_KEY];
    }).toBe('test-gemini-key');
    await expect(panel).toContainText('Add a few more notes');
});

test('notes page marks drawing-note navigation for the YouTube content script', async ({
    extensionId,
    page,
    seedExtensionStorage
}) => {
    const videoId = 'notes-page-annotation-video';
    await seedExtensionStorage({
        [NOTES_STORAGE_KEY]: {
            [videoId]: [
                {
                    id: 'drawing-note',
                    timestamp: 42,
                    text: 'Annotated saved note',
                    createdAt: 1,
                    updatedAt: 1,
                    annotation: {
                        version: 1,
                        scene: { version: '7.4.0', objects: [] },
                        image: {
                            dataUrl: PNG_DATA_URL,
                            width: 1,
                            height: 1,
                            generatedAt: 1
                        },
                        viewport: {
                            width: 960,
                            height: 360
                        }
                    }
                },
                {
                    id: 'plain-note',
                    timestamp: 90,
                    text: 'Plain saved note',
                    createdAt: 2,
                    updatedAt: 2
                }
            ]
        },
        [METADATA_STORAGE_KEY]: {
            [videoId]: {
                title: 'Notes Page Annotation Video',
                noteCount: 2,
                updatedAt: 2
            }
        }
    });

    await page.goto(`chrome-extension://${extensionId}/notes/notes.html`);
    await page.evaluate(() => {
        const globalState = window as unknown as { __openedNoteUrls: string[] };
        const chromeApi = chrome as unknown as {
            tabs: {
                create: (
                    properties: { url?: string },
                    callback?: () => void
                ) => void;
            };
        };
        globalState.__openedNoteUrls = [];
        chromeApi.tabs.create = (properties, callback): void => {
            if (typeof properties.url === 'string') {
                globalState.__openedNoteUrls.push(properties.url);
            }
            callback?.();
        };
    });

    await page.locator('.note-button', { hasText: 'Annotated saved note' }).click();
    await page.locator('.note-button', { hasText: 'Plain saved note' }).click();

    const openedUrls = await page.evaluate(() => (
        (window as unknown as { __openedNoteUrls: string[] }).__openedNoteUrls
    ));
    expect(openedUrls).toHaveLength(2);
    const drawingUrl = new URL(openedUrls[0] || 'https://www.youtube.com/watch');
    expect(drawingUrl.searchParams.get('v')).toBe(videoId);
    expect(drawingUrl.searchParams.get('t')).toBe('42');
    expect(drawingUrl.searchParams.get('videoNotesNote')).toBe('drawing-note');

    const plainUrl = new URL(openedUrls[1] || 'https://www.youtube.com/watch');
    expect(plainUrl.searchParams.get('v')).toBe(videoId);
    expect(plainUrl.searchParams.get('t')).toBe('90');
    expect(plainUrl.searchParams.has('videoNotesNote')).toBe(false);
});

test('notes page plays a cached flashcard deck without calling Gemini', async ({
    extensionId,
    page,
    seedExtensionStorage
}) => {
    const notes = createFlashcardNotes();
    const noteIdsHash = computeNoteIdsHash(notes.map((note) => note.id));

    await seedExtensionStorage({
        [FLASHCARDS_ENABLED_STORAGE_KEY]: true,
        [GEMINI_API_KEY_STORAGE_KEY]: 'cached-test-key',
        [NOTES_STORAGE_KEY]: {
            'flashcards-video': notes
        },
        [METADATA_STORAGE_KEY]: {
            'flashcards-video': {
                title: 'Flashcards Source Video',
                noteCount: notes.length,
                updatedAt: 1_700_000_000_010
            }
        },
        [FLASHCARDS_CACHE_STORAGE_KEY]: {
            generatedAt: Date.now(),
            noteIdsHash,
            deck: [
                {
                    question: 'What does the cached deck verify?',
                    correctAnswer: 'Flashcard gameplay',
                    wrongAnswers: ['Backup import', 'Zen mode', 'Timeline editing'],
                    source: {
                        videoId: 'flashcards-video',
                        videoTitle: 'Flashcards Source Video',
                        timestamp: 15,
                        noteText: 'Study note 1 with enough detail for a quiz'
                    }
                }
            ]
        }
    });

    await page.goto(`chrome-extension://${extensionId}/notes/notes.html`);

    const panel = page.locator('#flashcards-panel');
    await expect(panel).toBeVisible();
    await expect(panel).toContainText('Card 1 of 1');
    await expect(panel).toContainText('What does the cached deck verify?');

    await panel.getByRole('button', { name: 'Flashcard gameplay' }).click();
    await expect(panel).toContainText("Nice — that's right.");
    await expect(panel).toContainText('Score: 1');

    await panel.getByRole('button', { name: 'See results' }).click();
    await expect(panel).toContainText('Great job!');
    await expect(panel).toContainText('You scored 1 out of 1.');
});
