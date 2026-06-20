import {
    FLASHCARDS_MIN_NOTES,
    GEMINI_API_KEY_STORAGE_KEY,
    NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY
} from '../../popup/ts/constants.js';
import {
    buildTimestampUrl,
    escapeHtml,
    getOrGenerateDeck,
    readCachedDeck,
    shuffle
} from '../../popup/ts/flashcard-deck.js';
import { getStorageSnapshot, resolveNewTabFlashcardsEnabledSetting } from '../../popup/ts/storage.js';
import { renderSingleCard } from './newtab-card.js';

const cardElement = document.getElementById('newtab-card');

let deck: Flashcard[] = [];
let order: number[] = [];
let cursor = 0;
let lastShownIndex: number | null = null;

const buildOrder = (length: number): number[] => shuffle(Array.from({ length }, (_value, index) => index));

// Build a fresh shuffled order and rewind the cursor. The card just shown is
// never placed first, so the next draw — at a cycle boundary or right after a
// background deck swap — never repeats the visible card.
const reshuffleOrder = (): void => {
    order = buildOrder(deck.length);
    cursor = 0;
    if (deck.length > 1 && order[0] === lastShownIndex) {
        const swapAt = 1 + Math.floor(Math.random() * (deck.length - 1));
        const first = order[0];
        const other = order[swapAt];
        if (typeof first === 'number' && typeof other === 'number') {
            order[0] = other;
            order[swapAt] = first;
        }
    }
};

const seedDeck = (nextDeck: Flashcard[]): void => {
    deck = nextDeck;
    reshuffleOrder();
};

// Draw the next card, cycling through a shuffled order. When the order is
// exhausted we reshuffle and start over — so cards keep coming with no network
// call and without immediate repeats.
const pickNext = (): Flashcard | null => {
    if (deck.length === 0) {
        return null;
    }
    if (cursor >= order.length) {
        reshuffleOrder();
    }
    const index = order[cursor] ?? 0;
    cursor += 1;
    lastShownIndex = index;
    return deck[index] ?? null;
};

const openUrl = (url: string): void => {
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url }).catch(() => {
            window.open(url, '_blank', 'noopener');
        });
        return;
    }
    window.open(url, '_blank', 'noopener');
};

const openSource = (videoId: string, timestamp: number): void => {
    openUrl(buildTimestampUrl(videoId, timestamp));
};

const showCard = (card: Flashcard): void => {
    if (!cardElement) {
        return;
    }
    renderSingleCard(cardElement, card, {
        onNext: () => {
            const next = pickNext();
            if (next) {
                showCard(next);
            }
        },
        onOpenSource: openSource
    });
    cardElement.hidden = false;
};

const showFirstCard = (): void => {
    const first = pickNext();
    if (first) {
        showCard(first);
    }
};

const renderPreparing = (): void => {
    if (!cardElement) {
        return;
    }
    cardElement.hidden = false;
    cardElement.innerHTML = `
        <div class="nt__status">
            <div class="nt__spinner" aria-hidden="true"></div>
            <p class="nt__status-title">Preparing your flashcards…</p>
            <p class="nt__status-text">Building a quiz from your latest notes.</p>
        </div>
    `;
};

const renderStatus = (title: string, text: string): void => {
    if (!cardElement) {
        return;
    }
    cardElement.hidden = false;
    cardElement.innerHTML = `
        <div class="nt__status">
            <p class="nt__status-title">${escapeHtml(title)}</p>
            <p class="nt__status-text">${escapeHtml(text)}</p>
        </div>
    `;
};

// ===== Clock =====
const timeElement = document.getElementById('nt-time');
const ampmElement = document.getElementById('nt-ampm');
const subtitleElement = document.getElementById('nt-subtitle');
let lastClockText = '';

const renderClock = (): void => {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes().toString().padStart(2, '0');
    let display = hours % 12;
    if (display === 0) {
        display = 12;
    }
    const timeText = `${display}:${minutes}`;
    if (timeText === lastClockText) {
        return;
    }
    lastClockText = timeText;

    const greeting = hours < 12 ? 'Good morning' : hours < 18 ? 'Good afternoon' : 'Good evening';
    const dateText = now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

    if (timeElement) {
        timeElement.textContent = timeText;
    }
    if (ampmElement) {
        ampmElement.textContent = hours < 12 ? 'AM' : 'PM';
    }
    if (subtitleElement) {
        subtitleElement.textContent = `${greeting} · ${dateText}`;
    }
};

const startClock = (): void => {
    renderClock();
    window.setInterval(renderClock, 1000);
};

// ===== Notes button =====
const wireNotesButton = (): void => {
    const button = document.getElementById('nt-open-notes');
    if (!button) {
        return;
    }
    const url = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.getURL
        ? chrome.runtime.getURL('notes/notes.html')
        : '../notes/notes.html';
    button.addEventListener('click', () => openUrl(url));
};

const boot = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const enabled = resolveNewTabFlashcardsEnabledSetting(snapshot[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]);
    const rawKey = snapshot[GEMINI_API_KEY_STORAGE_KEY];
    const hasKey = typeof rawKey === 'string' && rawKey.trim().length > 0;

    // The background script only redirects new tabs here when the feature is on and a
    // deck is cached; this gate handles direct navigation to the page.
    if (!hasKey) {
        renderStatus(
            'No flashcards yet',
            'Add a Gemini API key in the Video Notes popup to turn your notes into a flashcard each time you open a tab.'
        );
        return;
    }
    if (!enabled) {
        renderStatus(
            'Flashcards on new tab are off',
            'Turn on “Flashcards on new tab” in the Video Notes popup to study a card here.'
        );
        return;
    }

    // Stale-while-revalidate: paint instantly from the cache, refresh in the background.
    const cached = await readCachedDeck();
    if (cached && cached.deck.length > 0) {
        seedDeck(cached.deck);
        showFirstCard();
        getOrGenerateDeck()
            .then((result) => {
                if (result.status === 'ok' && result.deck.length > 0) {
                    seedDeck(result.deck);
                }
            })
            .catch(() => {});
        return;
    }

    // Cold cache (e.g. just enabled): generate inline, then render or explain why not.
    renderPreparing();

    const result = await getOrGenerateDeck();
    if (result.status === 'ok' && result.deck.length > 0) {
        seedDeck(result.deck);
        showFirstCard();
        return;
    }

    if (result.status === 'insufficient-notes') {
        renderStatus(
            'Not enough notes yet',
            `Add at least ${FLASHCARDS_MIN_NOTES} notes across your videos and your flashcards will appear here.`
        );
    } else if (result.status === 'no-key') {
        renderStatus(
            'No flashcards yet',
            'Add a Gemini API key in the Video Notes popup to turn your notes into flashcards.'
        );
    } else if (result.status === 'error') {
        renderStatus("Couldn't build your flashcards", result.message);
    } else {
        renderStatus('No flashcards yet', 'Keep adding notes to your videos and your flashcards will appear here.');
    }
};

startClock();
wireNotesButton();
boot().catch(() => {});
