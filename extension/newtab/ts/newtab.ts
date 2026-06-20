import { GEMINI_API_KEY_STORAGE_KEY, NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY } from '../../popup/ts/constants.js';
import { buildTimestampUrl, getOrGenerateDeck, readCachedDeck, shuffle } from '../../popup/ts/flashcard-deck.js';
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

const openSource = (videoId: string, timestamp: number): void => {
    const url = buildTimestampUrl(videoId, timestamp);
    if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.create) {
        chrome.tabs.create({ url }).catch(() => {
            window.open(url, '_blank', 'noopener');
        });
        return;
    }
    window.open(url, '_blank', 'noopener');
};

const showCard = (card: Flashcard): void => {
    if (!cardElement) {
        return;
    }
    cardElement.classList.remove('newtab__card--preparing');
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

const hideCard = (): void => {
    if (cardElement) {
        cardElement.hidden = true;
        cardElement.textContent = '';
        cardElement.classList.remove('newtab__card--preparing');
    }
};

const boot = async (): Promise<void> => {
    const snapshot = await getStorageSnapshot();
    const enabled = resolveNewTabFlashcardsEnabledSetting(snapshot[NEWTAB_FLASHCARDS_ENABLED_STORAGE_KEY]);
    const rawKey = snapshot[GEMINI_API_KEY_STORAGE_KEY];
    const hasKey = typeof rawKey === 'string' && rawKey.trim().length > 0;

    // The background script only redirects new tabs here when the feature is on and a
    // deck is cached; this gate just guards direct navigation to the page.
    if (!enabled || !hasKey) {
        hideCard();
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

    // Cold cache (e.g. just enabled): generate inline, then render or stay blank.
    if (cardElement) {
        cardElement.hidden = false;
        cardElement.textContent = 'Preparing your flashcards…';
        cardElement.classList.add('newtab__card--preparing');
    }

    const result = await getOrGenerateDeck();
    if (result.status === 'ok' && result.deck.length > 0) {
        seedDeck(result.deck);
        showFirstCard();
    } else {
        hideCard();
    }
};

boot().catch(() => {});
