import { escapeHtml, shuffle } from '../../popup/ts/flashcard-deck.js';
import { formatTimestamp } from '../../popup/ts/data.js';

interface SingleCardCallbacks {
    onNext: () => void;
    onOpenSource: (videoId: string, timestamp: number) => void;
}

const CHECK_ICON =
    '<svg class="nt__opt-icon nt__opt-icon--check" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6L9 17l-5-5"></path></svg>';
const CROSS_ICON =
    '<svg class="nt__opt-icon nt__opt-icon--cross" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12"></path></svg>';
const PLAY_ICON =
    '<svg class="nt__source-icon" width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"></path></svg>';

// One window keydown listener lives at a time. Each card render swaps in its own
// handler so number keys map to the freshly shuffled options and Space advances
// only once the current card is answered.
let activeKeyHandler: ((event: KeyboardEvent) => void) | null = null;

const detachKeyHandler = (): void => {
    if (activeKeyHandler) {
        window.removeEventListener('keydown', activeKeyHandler);
        activeKeyHandler = null;
    }
};

// Render one multiple-choice card into `host`, matching the new-tab design:
// topic pill (the source video) → question → numbered options that turn
// correct/wrong/dim on answer → the originating note → a jump-to-source footer,
// with a Next button (or keyboard hint) below the card.
const renderSingleCard = (host: HTMLElement, card: Flashcard, callbacks: SingleCardCallbacks): void => {
    const options = shuffle([card.correctAnswer, ...card.wrongAnswers]);
    let selected: string | null = null;

    const optionsMarkup = (): string =>
        options
            .map((option, index) => {
                const answered = selected !== null;
                const isCorrectOption = option === card.correctAnswer;
                const isSelected = selected === option;
                const classes = ['nt__opt'];
                let trailingIcon = '';
                if (answered) {
                    if (isCorrectOption) {
                        classes.push('nt__opt--correct');
                        trailingIcon = CHECK_ICON;
                    } else if (isSelected) {
                        classes.push('nt__opt--wrong');
                        trailingIcon = CROSS_ICON;
                    } else {
                        classes.push('nt__opt--dim');
                    }
                }
                const badge = answered
                    ? ''
                    : `<span class="nt__opt-badge">${index + 1}</span>`;
                return `
                    <button type="button" class="${classes.join(' ')}" data-answer="${escapeHtml(option)}" ${answered ? 'disabled' : ''}>
                        ${badge}
                        <span class="nt__opt-text">${escapeHtml(option)}</span>
                        ${trailingIcon}
                    </button>
                `;
            })
            .join('');

    const noteMarkup = (): string => {
        const note = card.source.noteText?.trim();
        if (selected === null || !note) {
            return '';
        }
        return `
            <div class="nt__note">
                <div class="nt__note-label">FROM YOUR NOTE</div>
                <p class="nt__note-text">${escapeHtml(note)}</p>
            </div>
        `;
    };

    const footerMarkup = (): string => {
        if (selected !== null) {
            return '<button type="button" class="nt__next" data-action="next-card">Next card →</button>';
        }
        return '<div class="nt__hint">Press <b>1–4</b> to answer</div>';
    };

    const paint = (): void => {
        host.innerHTML = `
            <div class="nt__card">
                <div class="nt__pill">
                    <span class="nt__pill-dot"></span>
                    <span class="nt__pill-text">${escapeHtml(card.source.videoTitle)}</span>
                </div>
                <p class="nt__question">${escapeHtml(card.question)}</p>
                <div class="nt__options">${optionsMarkup()}</div>
                ${noteMarkup()}
                <button type="button" class="nt__source" data-action="open-source">
                    ${PLAY_ICON}
                    <span class="nt__source-label">Jump to source</span>
                    <span class="nt__source-time">${escapeHtml(formatTimestamp(card.source.timestamp))}</span>
                </button>
            </div>
            <div class="nt__footer">${footerMarkup()}</div>
        `;

        host.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((button) => {
            button.addEventListener('click', () => {
                const answer = button.getAttribute('data-answer') ?? '';
                choose(answer);
            });
        });

        const nextButton = host.querySelector<HTMLButtonElement>('[data-action="next-card"]');
        if (nextButton) {
            nextButton.addEventListener('click', () => callbacks.onNext());
        }

        const sourceButton = host.querySelector<HTMLButtonElement>('[data-action="open-source"]');
        if (sourceButton) {
            sourceButton.addEventListener('click', () => {
                callbacks.onOpenSource(card.source.videoId, card.source.timestamp);
            });
        }
    };

    const choose = (answer: string): void => {
        if (selected !== null || !options.includes(answer)) {
            return;
        }
        selected = answer;
        paint();
    };

    detachKeyHandler();
    activeKeyHandler = (event: KeyboardEvent): void => {
        if (event.metaKey || event.ctrlKey || event.altKey) {
            return;
        }
        if (selected === null) {
            const choice = Number.parseInt(event.key, 10);
            if (Number.isInteger(choice) && choice >= 1 && choice <= options.length) {
                event.preventDefault();
                choose(options[choice - 1] ?? '');
            }
        } else if (event.key === ' ' || event.key === 'Enter' || event.key === 'ArrowRight') {
            event.preventDefault();
            callbacks.onNext();
        }
    };
    window.addEventListener('keydown', activeKeyHandler);

    paint();
};

export { renderSingleCard };
