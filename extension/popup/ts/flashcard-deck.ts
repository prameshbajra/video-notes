import {
    FLASHCARDS_CACHE_STORAGE_KEY,
    FLASHCARDS_CACHE_TTL_MS,
    FLASHCARDS_DECK_SIZE,
    FLASHCARDS_MIN_NOTES,
    GEMINI_API_KEY_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NOTES_STORAGE_KEY
} from './constants.js';
import { getObjectOrEmpty, isPlainObject, normalizeNotes } from './data.js';
import { getStorageSnapshot, persistFlashcardsCache } from './storage.js';

const GEMINI_MODEL = 'gemini-2.5-flash';
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const MAX_NOTES_SAMPLED = 80;
const MAX_NOTE_CHARS = 400;

interface NoteForPrompt {
    id: string;
    videoId: string;
    videoTitle: string;
    timestamp: number;
    noteText: string;
}

const collectNotesForPrompt = (
    notesPayload: NotesIndex,
    metadataPayload: MetadataIndex
): NoteForPrompt[] => {
    const collected: NoteForPrompt[] = [];

    Object.entries(notesPayload).forEach(([videoId, rawNotes]) => {
        if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
            return;
        }

        const sanitized = rawNotes.filter((note): note is StoredNote => isPlainObject(note));
        const normalized = normalizeNotes(videoId, sanitized);
        const metadata = metadataPayload[videoId];
        const rawTitle = metadata && typeof metadata.title === 'string' ? metadata.title.trim() : '';
        const videoTitle = rawTitle || videoId;

        normalized.forEach((note) => {
            if (!note.text || note.text === '(No text)') {
                return;
            }
            const trimmed = note.text.length > MAX_NOTE_CHARS ? `${note.text.slice(0, MAX_NOTE_CHARS)}…` : note.text;
            collected.push({
                id: note.id,
                videoId,
                videoTitle,
                timestamp: note.timestamp,
                noteText: trimmed
            });
        });
    });

    return collected;
};

const sampleNotes = (notes: NoteForPrompt[], limit: number): NoteForPrompt[] => {
    if (notes.length <= limit) {
        return notes;
    }
    const copy = notes.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i] as NoteForPrompt;
        copy[i] = copy[j] as NoteForPrompt;
        copy[j] = tmp;
    }
    return copy.slice(0, limit);
};

const computeNoteIdsHash = (notes: NoteForPrompt[]): string => {
    const ids = notes.map((n) => n.id).sort();
    let hash = 5381;
    const combined = ids.join('|');
    for (let i = 0; i < combined.length; i++) {
        hash = ((hash << 5) + hash + combined.charCodeAt(i)) | 0;
    }
    return `${ids.length}:${(hash >>> 0).toString(36)}`;
};

const buildPromptPayload = (notes: NoteForPrompt[]): Record<string, unknown> => {
    const compactNotes = notes.map((note) => ({
        id: note.id,
        videoId: note.videoId,
        videoTitle: note.videoTitle,
        timestampSeconds: note.timestamp,
        note: note.noteText
    }));

    const system =
        'You are a study coach building a flashcard quiz from a user\'s notes on YouTube videos. ' +
        'Generate multiple-choice questions that test the user\'s understanding of concepts, facts, or insights captured in their notes. ' +
        'Never ask a question where the answer is simply the literal text of a note. Questions should feel like a quiz, not a memory test for the exact wording. ' +
        'Each question has exactly one correct answer and three plausible but clearly wrong distractors. ' +
        'Distractors should be similar in type/length to the correct answer. Keep questions and answers concise (under 20 words each). ' +
        `Use the "sourceNoteId" field to link each flashcard to the note it was generated from (must match one of the note ids given).`;

    const userInstruction =
        `Create exactly ${FLASHCARDS_DECK_SIZE} multiple-choice flashcards from the notes below. ` +
        'Pick a diverse spread across different videos when possible. Skip notes that are too short or lack substance. ' +
        'Return JSON matching the schema.';

    return {
        systemInstruction: {
            parts: [{ text: system }]
        },
        contents: [
            {
                role: 'user',
                parts: [
                    { text: userInstruction },
                    { text: `Notes JSON:\n${JSON.stringify(compactNotes)}` }
                ]
            }
        ],
        generationConfig: {
            temperature: 0.6,
            responseMimeType: 'application/json',
            responseSchema: {
                type: 'OBJECT',
                properties: {
                    flashcards: {
                        type: 'ARRAY',
                        items: {
                            type: 'OBJECT',
                            properties: {
                                sourceNoteId: { type: 'STRING' },
                                question: { type: 'STRING' },
                                correctAnswer: { type: 'STRING' },
                                wrongAnswers: {
                                    type: 'ARRAY',
                                    items: { type: 'STRING' }
                                }
                            },
                            required: ['sourceNoteId', 'question', 'correctAnswer', 'wrongAnswers']
                        }
                    }
                },
                required: ['flashcards']
            }
        }
    };
};

interface GeminiRawCard {
    sourceNoteId?: unknown;
    question?: unknown;
    correctAnswer?: unknown;
    wrongAnswers?: unknown;
}

const parseGeminiResponse = (payload: unknown, notesById: Map<string, NoteForPrompt>): Flashcard[] => {
    if (!isPlainObject(payload)) {
        throw new Error('Unexpected Gemini response');
    }

    const candidates = Array.isArray(payload.candidates) ? payload.candidates : [];
    if (candidates.length === 0) {
        throw new Error('Gemini returned no candidates');
    }

    const firstCandidate = candidates[0];
    if (!isPlainObject(firstCandidate) || !isPlainObject(firstCandidate.content)) {
        throw new Error('Gemini candidate missing content');
    }

    const parts = Array.isArray(firstCandidate.content.parts) ? firstCandidate.content.parts : [];
    const textPart = parts
        .map((p) => (isPlainObject(p) && typeof p.text === 'string' ? p.text : ''))
        .join('')
        .trim();

    if (!textPart) {
        throw new Error('Gemini response was empty');
    }

    let parsed: unknown;
    try {
        parsed = JSON.parse(textPart);
    } catch {
        throw new Error('Gemini returned invalid JSON');
    }

    const rawCards = isPlainObject(parsed) && Array.isArray(parsed.flashcards)
        ? (parsed.flashcards as GeminiRawCard[])
        : [];

    const deck: Flashcard[] = [];
    rawCards.forEach((raw) => {
        if (!isPlainObject(raw)) {
            return;
        }
        const question = typeof raw.question === 'string' ? raw.question.trim() : '';
        const correctAnswer = typeof raw.correctAnswer === 'string' ? raw.correctAnswer.trim() : '';
        const wrongAnswersRaw = Array.isArray(raw.wrongAnswers) ? raw.wrongAnswers : [];
        const wrongAnswers = wrongAnswersRaw
            .filter((w): w is string => typeof w === 'string')
            .map((w) => w.trim())
            .filter((w) => w.length > 0 && w.toLowerCase() !== correctAnswer.toLowerCase())
            .slice(0, 3);
        const sourceNoteId = typeof raw.sourceNoteId === 'string' ? raw.sourceNoteId : '';

        if (!question || !correctAnswer || wrongAnswers.length < 3) {
            return;
        }

        const sourceNote = notesById.get(sourceNoteId);
        if (!sourceNote) {
            return;
        }

        deck.push({
            question,
            correctAnswer,
            wrongAnswers,
            source: {
                videoId: sourceNote.videoId,
                videoTitle: sourceNote.videoTitle,
                timestamp: sourceNote.timestamp,
                noteText: sourceNote.noteText
            }
        });
    });

    return deck.slice(0, FLASHCARDS_DECK_SIZE);
};

const callGeminiApi = async (
    apiKey: string,
    notes: NoteForPrompt[]
): Promise<Flashcard[]> => {
    const url = new URL(GEMINI_ENDPOINT);
    url.searchParams.set('key', apiKey);

    const payload = buildPromptPayload(notes);

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        if (response.status === 400 || response.status === 401 || response.status === 403) {
            throw new Error('Invalid Gemini API key or missing access.');
        }
        if (response.status === 429) {
            throw new Error('Gemini rate limit hit. Please try again in a moment.');
        }
        throw new Error(`Gemini request failed (${response.status}).`);
    }

    const data = await response.json();
    const notesById = new Map<string, NoteForPrompt>();
    notes.forEach((n) => notesById.set(n.id, n));

    const deck = parseGeminiResponse(data, notesById);
    if (deck.length === 0) {
        throw new Error('Gemini returned no usable flashcards.');
    }
    return deck;
};

const readCachedDeck = async (): Promise<FlashcardsCache | null> => {
    const snapshot = await getStorageSnapshot();
    const cached = snapshot[FLASHCARDS_CACHE_STORAGE_KEY];
    if (!isPlainObject(cached) || !Array.isArray(cached.deck)) {
        return null;
    }
    const generatedAt = Number(cached.generatedAt);
    const noteIdsHash = typeof cached.noteIdsHash === 'string' ? cached.noteIdsHash : '';
    if (!Number.isFinite(generatedAt) || !noteIdsHash) {
        return null;
    }
    return {
        deck: cached.deck as Flashcard[],
        generatedAt,
        noteIdsHash
    };
};

const isCacheFresh = (cache: FlashcardsCache, currentHash: string): boolean => {
    if (cache.noteIdsHash !== currentHash) {
        return false;
    }
    return Date.now() - cache.generatedAt < FLASHCARDS_CACHE_TTL_MS;
};

const shuffle = <T>(items: T[]): T[] => {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        const tmp = copy[i] as T;
        copy[i] = copy[j] as T;
        copy[j] = tmp;
    }
    return copy;
};

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const buildTimestampUrl = (videoId: string, seconds: number): string => {
    const url = new URL('https://www.youtube.com/watch');
    url.searchParams.set('v', videoId);
    const secs = Math.max(0, Math.floor(seconds));
    if (secs > 0) {
        url.searchParams.set('t', secs.toString());
    }
    return url.toString();
};

export type DeckResult =
    | { status: 'ok'; deck: Flashcard[] }
    | { status: 'insufficient-notes' }
    | { status: 'no-key' }
    | { status: 'error'; message: string };

// Cache-aware deck loader, no DOM. Returns a fresh cache when one matches the
// current notes (hash + <24h); otherwise asks Gemini, overwrites the cache, and
// returns the new deck. Overwriting (rather than remove-then-regenerate) avoids
// a transient empty cache window.
const getOrGenerateDeck = async (): Promise<DeckResult> => {
    const snapshot = await getStorageSnapshot();
    const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
    const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
    const allNotes = collectNotesForPrompt(notesPayload, metadataPayload);

    if (allNotes.length < FLASHCARDS_MIN_NOTES) {
        return { status: 'insufficient-notes' };
    }

    const hash = computeNoteIdsHash(allNotes);
    const cached = await readCachedDeck();
    if (cached && isCacheFresh(cached, hash) && cached.deck.length > 0) {
        return { status: 'ok', deck: cached.deck };
    }

    const rawKey = snapshot[GEMINI_API_KEY_STORAGE_KEY];
    const apiKey = typeof rawKey === 'string' ? rawKey.trim() : '';
    if (!apiKey) {
        return { status: 'no-key' };
    }

    const sampled = sampleNotes(allNotes, MAX_NOTES_SAMPLED);

    try {
        const deck = await callGeminiApi(apiKey, sampled);
        const cache: FlashcardsCache = {
            deck,
            generatedAt: Date.now(),
            noteIdsHash: hash
        };
        await persistFlashcardsCache(cache);
        return { status: 'ok', deck };
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to generate flashcards.';
        return { status: 'error', message };
    }
};

export {
    buildTimestampUrl,
    escapeHtml,
    getOrGenerateDeck,
    readCachedDeck,
    shuffle
};
