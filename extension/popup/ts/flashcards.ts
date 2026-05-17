import {
    FLASHCARDS_CACHE_STORAGE_KEY,
    FLASHCARDS_CACHE_TTL_MS,
    FLASHCARDS_DECK_SIZE,
    FLASHCARDS_ENABLED_STORAGE_KEY,
    FLASHCARDS_MIN_NOTES,
    GEMINI_API_KEY_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NOTES_STORAGE_KEY
} from './constants.js';
import { elements, viewContext } from './state.js';
import { formatTimestamp, getObjectOrEmpty, isPlainObject, normalizeNotes } from './data.js';
import {
    getStorageSnapshot,
    persistFlashcardsCache,
    persistGeminiApiKey,
    removeFlashcardsCache,
    resolveFlashcardsEnabledSetting
} from './storage.js';

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

const gameState: FlashcardGameState = {
    status: 'disabled',
    deck: [],
    currentIndex: 0,
    score: 0,
    answeredIds: new Set<number>(),
    lastAnswer: null,
    errorMessage: null
};

const resetGame = (): void => {
    gameState.currentIndex = 0;
    gameState.score = 0;
    gameState.answeredIds = new Set<number>();
    gameState.lastAnswer = null;
};

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

const loadCachedDeck = async (): Promise<FlashcardsCache | null> => {
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

const setStatus = (status: FlashcardStatus, errorMessage: string | null = null): void => {
    gameState.status = status;
    gameState.errorMessage = errorMessage;
    render();
};

const ensureGeminiApiKey = async (): Promise<string | null> => {
    const snapshot = await getStorageSnapshot();
    const key = snapshot[GEMINI_API_KEY_STORAGE_KEY];
    if (typeof key !== 'string' || !key.trim()) {
        return null;
    }
    return key.trim();
};

const generateAndCacheDeck = async (): Promise<void> => {
    setStatus('loading');

    const apiKey = await ensureGeminiApiKey();
    if (!apiKey) {
        setStatus('error', 'Missing Gemini API key.');
        return;
    }

    const snapshot = await getStorageSnapshot();
    const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
    const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
    const allNotes = collectNotesForPrompt(notesPayload, metadataPayload);

    if (allNotes.length < FLASHCARDS_MIN_NOTES) {
        gameState.deck = [];
        setStatus('insufficient-notes');
        return;
    }

    const sampled = sampleNotes(allNotes, MAX_NOTES_SAMPLED);
    const hash = computeNoteIdsHash(allNotes);

    try {
        const deck = await callGeminiApi(apiKey, sampled);
        const cache: FlashcardsCache = {
            deck,
            generatedAt: Date.now(),
            noteIdsHash: hash
        };
        await persistFlashcardsCache(cache);
        gameState.deck = deck;
        resetGame();
        setStatus('playing');
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to generate flashcards.';
        setStatus('error', message);
    }
};

const loadOrRegenerateDeck = async (): Promise<void> => {
    setStatus('loading');

    const snapshot = await getStorageSnapshot();
    const notesPayload = getObjectOrEmpty<NotesIndex>(snapshot[NOTES_STORAGE_KEY]);
    const metadataPayload = getObjectOrEmpty<MetadataIndex>(snapshot[METADATA_STORAGE_KEY]);
    const allNotes = collectNotesForPrompt(notesPayload, metadataPayload);

    if (allNotes.length < FLASHCARDS_MIN_NOTES) {
        gameState.deck = [];
        setStatus('insufficient-notes');
        return;
    }

    const hash = computeNoteIdsHash(allNotes);
    const cached = await loadCachedDeck();
    if (cached && isCacheFresh(cached, hash) && cached.deck.length > 0) {
        gameState.deck = cached.deck;
        resetGame();
        setStatus('playing');
        return;
    }

    await removeFlashcardsCache().catch(() => {});
    await generateAndCacheDeck();
};

const handleAnswerClick = (selectedAnswer: string): void => {
    if (gameState.status !== 'playing' || gameState.lastAnswer) {
        return;
    }
    const card = gameState.deck[gameState.currentIndex];
    if (!card) {
        return;
    }
    const isCorrect = selectedAnswer === card.correctAnswer;
    if (isCorrect) {
        gameState.score += 1;
    }
    gameState.lastAnswer = {
        index: gameState.currentIndex,
        correct: isCorrect,
        selected: selectedAnswer
    };
    render();
};

const handleNextClick = (): void => {
    if (!gameState.lastAnswer) {
        return;
    }
    const nextIndex = gameState.currentIndex + 1;
    gameState.lastAnswer = null;
    if (nextIndex >= gameState.deck.length) {
        setStatus('complete');
        return;
    }
    gameState.currentIndex = nextIndex;
    render();
};

const handleReplayClick = (): void => {
    if (gameState.deck.length === 0) {
        return;
    }
    resetGame();
    setStatus('playing');
};

const handleOpenSource = (videoId: string, timestamp: number): void => {
    const url = buildTimestampUrl(videoId, timestamp);
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url }).catch(() => {
            window.open(url, '_blank', 'noopener');
        });
        return;
    }
    window.open(url, '_blank', 'noopener');
};

const renderNoKey = (panel: HTMLElement, errorMessage: string | null = null): void => {
    panel.innerHTML = `
        <div class="flashcards__intro">
            <h2 class="flashcards__title">Add your Gemini API key</h2>
            <p class="flashcards__description">Paste a free Gemini API key below to start building your daily flashcard deck.</p>
            <label for="flashcards-panel-key-input" class="flashcards-key-label">Gemini API key</label>
            <input
                id="flashcards-panel-key-input"
                class="flashcards-key-input"
                type="password"
                autocomplete="off"
                spellcheck="false"
                placeholder="Paste your key here"
            />
            <p class="flashcards-key-hint">
                Get a free key at
                <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio</a>.
                Stored locally on this device only.
            </p>
            ${errorMessage ? `<p class="flashcards__error">${escapeHtml(errorMessage)}</p>` : ''}
            <div class="flashcards-key-actions">
                <button type="button" class="settings-button" data-action="save-key">Save key</button>
            </div>
        </div>
    `;

    const input = panel.querySelector<HTMLInputElement>('#flashcards-panel-key-input');
    const saveButton = panel.querySelector<HTMLButtonElement>('[data-action="save-key"]');

    const handleSave = (): void => {
        const value = input ? input.value.trim() : '';
        if (!value) {
            renderNoKey(panel, 'Please paste your Gemini API key.');
            return;
        }
        saveKeyAndLoad(value).catch(() => {});
    };

    if (saveButton) {
        saveButton.addEventListener('click', handleSave);
    }

    if (input) {
        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                handleSave();
            }
        });
        input.focus();
    }
};

const saveKeyAndLoad = async (apiKey: string): Promise<void> => {
    setStatus('loading');
    try {
        await persistGeminiApiKey(apiKey);
    } catch {
        const panel = elements.flashcardsPanel;
        if (panel) {
            renderNoKey(panel, 'Unable to save the key. Please try again.');
        }
    }
};

const renderLoading = (panel: HTMLElement): void => {
    panel.innerHTML = `
        <div class="flashcards__intro">
            <h2 class="flashcards__title">Building your deck…</h2>
            <p class="flashcards__description">Generating 12 flashcards from your notes with Gemini.</p>
            <div class="flashcards__spinner" aria-hidden="true"></div>
        </div>
    `;
};

const renderError = (panel: HTMLElement, message: string): void => {
    panel.innerHTML = `
        <div class="flashcards__intro">
            <h2 class="flashcards__title">Couldn't build flashcards</h2>
            <p class="flashcards__description">${escapeHtml(message)}</p>
            <button type="button" class="settings-button" data-action="retry-flashcards">Try again</button>
        </div>
    `;

    const retry = panel.querySelector<HTMLButtonElement>('[data-action="retry-flashcards"]');
    if (retry) {
        retry.addEventListener('click', () => {
            loadOrRegenerateDeck().catch(() => {});
        });
    }
};

const renderInsufficient = (panel: HTMLElement): void => {
    panel.innerHTML = `
        <div class="flashcards__intro">
            <h2 class="flashcards__title">Add a few more notes</h2>
            <p class="flashcards__description">You need at least ${FLASHCARDS_MIN_NOTES} notes before we can build a flashcard deck. Keep watching and noting!</p>
        </div>
    `;
};

const renderComplete = (panel: HTMLElement): void => {
    panel.innerHTML = `
        <div class="flashcards__intro flashcards__intro--complete">
            <h2 class="flashcards__title">Great job!</h2>
            <p class="flashcards__score">You scored ${gameState.score} out of ${gameState.deck.length}.</p>
            <p class="flashcards__description">Come back tomorrow for a fresh deck. Or run it back now to lock in the ones you missed.</p>
            <button type="button" class="settings-button" data-action="replay-flashcards">Redo deck</button>
        </div>
    `;

    const replay = panel.querySelector<HTMLButtonElement>('[data-action="replay-flashcards"]');
    if (replay) {
        replay.addEventListener('click', handleReplayClick);
    }
};

const renderPlaying = (panel: HTMLElement): void => {
    const card = gameState.deck[gameState.currentIndex];
    if (!card) {
        setStatus('complete');
        return;
    }

    const options = shuffle([card.correctAnswer, ...card.wrongAnswers]);
    const lastAnswer = gameState.lastAnswer;
    const answered = lastAnswer && lastAnswer.index === gameState.currentIndex;
    const showFeedback = Boolean(answered);
    const wasCorrect = Boolean(answered && lastAnswer?.correct);

    const optionsHtml = options
        .map((option) => {
            const isCorrectOption = option === card.correctAnswer;
            const isSelected = answered && option === lastAnswer?.selected;
            const classes = ['flashcards__option'];
            if (showFeedback) {
                if (isCorrectOption) classes.push('flashcards__option--correct');
                if (isSelected && !isCorrectOption) classes.push('flashcards__option--wrong');
                if (!isSelected && !isCorrectOption) classes.push('flashcards__option--dim');
            }
            return `
                <button type="button" class="${classes.join(' ')}" data-answer="${escapeHtml(option)}" ${showFeedback ? 'disabled' : ''}>
                    <span class="flashcards__option-text">${escapeHtml(option)}</span>
                    ${showFeedback && isCorrectOption ? '<span class="flashcards__check" aria-hidden="true">✓</span>' : ''}
                </button>
            `;
        })
        .join('');

    const feedbackHtml = showFeedback
        ? `
            <div class="flashcards__feedback flashcards__feedback--${wasCorrect ? 'correct' : 'wrong'}">
                ${wasCorrect
                    ? '<p class="flashcards__feedback-title">Nice — that\'s right.</p>'
                    : `<p class="flashcards__feedback-title">Not quite.</p>
                       <p class="flashcards__feedback-correct"><strong>Answer:</strong> ${escapeHtml(card.correctAnswer)}</p>`}
                <button type="button" class="flashcards__source-link" data-action="open-source">
                    <span class="flashcards__source-label">${escapeHtml(card.source.videoTitle)}</span>
                    <span class="flashcards__source-timestamp">@ ${formatTimestamp(card.source.timestamp)}</span>
                </button>
                <button type="button" class="settings-button flashcards__next" data-action="next-card">
                    ${gameState.currentIndex + 1 >= gameState.deck.length ? 'See results' : 'Next question'}
                </button>
            </div>
        `
        : '';

    panel.innerHTML = `
        <div class="flashcards__game">
            <div class="flashcards__progress">
                <span class="flashcards__progress-label">Card ${gameState.currentIndex + 1} of ${gameState.deck.length}</span>
                <span class="flashcards__score-label">Score: ${gameState.score}</span>
            </div>
            <div class="flashcards__progress-bar" aria-hidden="true">
                <div class="flashcards__progress-bar-fill" style="width: ${((gameState.currentIndex) / gameState.deck.length) * 100}%"></div>
            </div>
            <p class="flashcards__question">${escapeHtml(card.question)}</p>
            <div class="flashcards__options">${optionsHtml}</div>
            ${feedbackHtml}
        </div>
    `;

    panel.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((button) => {
        button.addEventListener('click', () => {
            const answer = button.getAttribute('data-answer') || '';
            handleAnswerClick(answer);
        });
    });

    const nextButton = panel.querySelector<HTMLButtonElement>('[data-action="next-card"]');
    if (nextButton) {
        nextButton.addEventListener('click', handleNextClick);
    }

    const sourceButton = panel.querySelector<HTMLButtonElement>('[data-action="open-source"]');
    if (sourceButton) {
        sourceButton.addEventListener('click', () => {
            handleOpenSource(card.source.videoId, card.source.timestamp);
        });
    }
};

const render = (): void => {
    const panel = elements.flashcardsPanel;
    if (!panel) {
        return;
    }

    switch (gameState.status) {
        case 'loading':
            renderLoading(panel);
            return;
        case 'error':
            renderError(panel, gameState.errorMessage || 'Something went wrong.');
            return;
        case 'insufficient-notes':
            renderInsufficient(panel);
            return;
        case 'playing':
            renderPlaying(panel);
            return;
        case 'complete':
            renderComplete(panel);
            return;
        default:
            return;
    }
};

let panelInitialized = false;

const refreshFlashcardsPanel = (): void => {
    if (viewContext !== 'page') {
        return;
    }
    const panel = elements.flashcardsPanel;
    if (!panel) {
        return;
    }

    const isInitialCall = !panelInitialized;
    panelInitialized = true;

    getStorageSnapshot()
        .then((snapshot) => {
            const isEnabled = resolveFlashcardsEnabledSetting(snapshot[FLASHCARDS_ENABLED_STORAGE_KEY]);
            const apiKey = snapshot[GEMINI_API_KEY_STORAGE_KEY];
            const hasKey = typeof apiKey === 'string' && apiKey.trim().length > 0;

            if (!isEnabled) {
                gameState.deck = [];
                gameState.status = 'disabled';
                panel.innerHTML = '';
                panel.hidden = true;
                return;
            }

            panel.hidden = false;

            if (!hasKey) {
                gameState.deck = [];
                gameState.status = 'disabled';
                renderNoKey(panel);
                return;
            }

            if (isInitialCall || gameState.deck.length === 0) {
                loadOrRegenerateDeck().catch(() => {});
                return;
            }

            render();
        })
        .catch(() => {
            setStatus('error', 'Unable to read stored settings.');
        });
};

export { refreshFlashcardsPanel };
