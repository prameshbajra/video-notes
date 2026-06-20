import { expect, test } from './fixtures';

const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY = 'videoNotes:newTabFlashcardsEnabled';
const GEMINI_API_KEY_STORAGE_KEY = 'videoNotes:geminiApiKey';
const FLASHCARDS_CACHE_STORAGE_KEY = 'videoNotes:flashcardsCache';

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

const cachedDeck = [
    {
        question: 'What does the first cached card ask?',
        correctAnswer: 'The first correct answer',
        wrongAnswers: ['First distractor one', 'First distractor two', 'First distractor three'],
        source: {
            videoId: 'flashcards-video',
            videoTitle: 'Flashcards Source Video',
            timestamp: 15,
            noteText: 'Study note 1 with enough detail for a quiz'
        }
    },
    {
        question: 'What does the second cached card ask?',
        correctAnswer: 'The second correct answer',
        wrongAnswers: ['Second distractor one', 'Second distractor two', 'Second distractor three'],
        source: {
            videoId: 'flashcards-video',
            videoTitle: 'Flashcards Source Video',
            timestamp: 30,
            noteText: 'Study note 2 with enough detail for a quiz'
        }
    }
];

test('new tab renders a cached flashcard, reveals feedback, and advances on Next', async ({
    extensionId,
    page,
    seedExtensionStorage
}) => {
    const notes = createFlashcardNotes();
    const noteIdsHash = computeNoteIdsHash(notes.map((note) => note.id));

    await seedExtensionStorage({
        [NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]: true,
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
            deck: cachedDeck
        }
    });

    await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

    const card = page.locator('#newtab-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.nt__opt').first()).toBeVisible();

    const firstQuestion = await card.locator('.nt__question').textContent();
    expect(firstQuestion?.trim()).toBeTruthy();

    await card.locator('.nt__opt').first().click();
    // Answering reveals the correctness feedback, the originating note, and the source jump.
    await expect(card.locator('.nt__opt--correct')).toBeVisible();
    await expect(card.locator('.nt__note')).toBeVisible();
    await expect(card.locator('.nt__source')).toBeVisible();

    const nextButton = card.getByRole('button', { name: /Next card/ });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    const secondQuestion = await card.locator('.nt__question').textContent();
    expect(secondQuestion?.trim()).toBeTruthy();
    expect(secondQuestion).not.toBe(firstQuestion);
});

test('new tab onboards a Gemini key inline when the feature is enabled', async ({
    extensionId,
    getExtensionStorage,
    page,
    seedExtensionStorage
}) => {
    await seedExtensionStorage({
        [NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]: true
    });

    await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

    await expect(page.getByText('No flashcards yet')).toBeVisible();
    await expect(page.getByText(/Add a free Gemini API key/i)).toBeVisible();
    await expect(page.getByLabel('Gemini API key')).toHaveCount(0);

    await page.getByRole('button', { name: 'Add free Gemini key to generate flashcards' }).click();
    await expect(page.getByText('Add your Gemini API key')).toBeVisible();
    await page.getByLabel('Gemini API key').fill('inline-newtab-key');
    await page.getByRole('button', { name: 'Save key' }).click();

    await expect(page.getByText('Not enough notes yet')).toBeVisible();
    await expect.poll(async () => {
        const storage = await getExtensionStorage(GEMINI_API_KEY_STORAGE_KEY);
        return storage[GEMINI_API_KEY_STORAGE_KEY];
    }).toBe('inline-newtab-key');
});

test('new browser tabs open the inline Gemini onboarding when enabled without a key', async ({
    context,
    extensionId,
    seedExtensionStorage,
    serviceWorker
}) => {
    await seedExtensionStorage({
        [NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]: true
    });

    const newPagePromise = context.waitForEvent('page');
    await serviceWorker.evaluate(async () => {
        const chromeApi = (globalThis as unknown as {
            chrome: {
                runtime: { lastError?: { message?: string } };
                tabs: { create: (properties: Record<string, unknown>, callback: () => void) => void };
            };
        }).chrome;

        await new Promise<void>((resolve, reject) => {
            chromeApi.tabs.create({}, () => {
                const error = chromeApi.runtime.lastError;
                if (error) {
                    reject(new Error(error.message || 'Unable to create tab'));
                    return;
                }
                resolve();
            });
        });
    });

    const newPage = await newPagePromise;
    await expect(newPage).toHaveURL(`chrome-extension://${extensionId}/newtab/newtab.html`);
    await expect(newPage.getByText('No flashcards yet')).toBeVisible();
    await expect(newPage.getByRole('button', { name: 'Add free Gemini key to generate flashcards' })).toBeVisible();
    await expect(newPage.getByLabel('Gemini API key')).toHaveCount(0);
    await newPage.close();
});

test('new tab page shows an off-state message when the toggle is off', async ({
    extensionId,
    page,
    seedExtensionStorage
}) => {
    const notes = createFlashcardNotes();
    const noteIdsHash = computeNoteIdsHash(notes.map((note) => note.id));

    await seedExtensionStorage({
        [NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]: false,
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
            deck: cachedDeck
        }
    });

    await page.goto(`chrome-extension://${extensionId}/newtab/newtab.html`);

    const card = page.locator('#newtab-card');
    await expect(card).toBeVisible();
    await expect(card.locator('.nt__status')).toBeVisible();
    await expect(card.locator('.nt__opt')).toHaveCount(0);
});
