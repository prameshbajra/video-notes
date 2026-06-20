import {
    FLASHCARDS_ENABLED_STORAGE_KEY,
    FLASHCARDS_MIN_NOTES,
    GEMINI_API_KEY_STORAGE_KEY
} from './constants.js';
import { elements, viewContext } from './state.js';
import { formatTimestamp } from './data.js';
import {
    getStorageSnapshot,
    persistGeminiApiKey,
    resolveFlashcardsEnabledSetting
} from './storage.js';
import { buildTimestampUrl, escapeHtml, getOrGenerateDeck, shuffle } from './flashcard-deck.js';

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

const setStatus = (status: FlashcardStatus, errorMessage: string | null = null): void => {
    gameState.status = status;
    gameState.errorMessage = errorMessage;
    render();
};

const loadOrRegenerateDeck = async (): Promise<void> => {
    setStatus('loading');

    const result = await getOrGenerateDeck();
    if (result.status === 'ok') {
        gameState.deck = result.deck;
        resetGame();
        setStatus('playing');
    } else if (result.status === 'insufficient-notes') {
        gameState.deck = [];
        setStatus('insufficient-notes');
    } else if (result.status === 'no-key') {
        gameState.deck = [];
        setStatus('error', 'Missing Gemini API key.');
    } else {
        setStatus('error', result.message);
    }
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
