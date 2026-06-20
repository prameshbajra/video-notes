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

test('new tab renders a cached flashcard, reveals the source link, and advances on Next', async ({
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
    await expect(card.locator('.flashcards__option').first()).toBeVisible();

    const firstQuestion = await card.locator('.flashcards__question').textContent();
    expect(firstQuestion?.trim()).toBeTruthy();

    await card.locator('.flashcards__option').first().click();
    await expect(card.locator('.flashcards__source-link')).toBeVisible();

    const nextButton = card.getByRole('button', { name: 'Next' });
    await expect(nextButton).toBeVisible();
    await nextButton.click();

    const secondQuestion = await card.locator('.flashcards__question').textContent();
    expect(secondQuestion?.trim()).toBeTruthy();
    expect(secondQuestion).not.toBe(firstQuestion);
});

test('new tab page renders nothing when the toggle is off', async ({
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

    await expect(page.locator('#newtab-card')).toBeHidden();
    await expect(page.locator('.flashcards__option')).toHaveCount(0);
});
