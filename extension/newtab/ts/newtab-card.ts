import { escapeHtml, shuffle } from '../../popup/ts/flashcard-deck.js';
import { formatTimestamp } from '../../popup/ts/data.js';

interface SingleCardCallbacks {
    onNext: () => void;
    onOpenSource: (videoId: string, timestamp: number) => void;
}

// Render one multiple-choice card into `host`, reusing the same `.flashcards__*`
// class names as the notes-page game so notes.css styles it for free. Unlike the
// notes-page renderer there is no progress bar, score, or results screen — answering
// reveals feedback + source link + a single "Next" button.
const renderSingleCard = (host: HTMLElement, card: Flashcard, callbacks: SingleCardCallbacks): void => {
    const options = shuffle([card.correctAnswer, ...card.wrongAnswers]);

    const paint = (selected: string | null): void => {
        const showFeedback = selected !== null;
        const wasCorrect = selected === card.correctAnswer;

        const optionsHtml = options
            .map((option) => {
                const isCorrectOption = option === card.correctAnswer;
                const isSelected = selected === option;
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
                    <button type="button" class="settings-button flashcards__next" data-action="next-card">Next</button>
                </div>
            `
            : '';

        host.innerHTML = `
            <div class="flashcards__game">
                <p class="flashcards__question">${escapeHtml(card.question)}</p>
                <div class="flashcards__options">${optionsHtml}</div>
                ${feedbackHtml}
            </div>
        `;

        host.querySelectorAll<HTMLButtonElement>('[data-answer]').forEach((button) => {
            button.addEventListener('click', () => {
                if (selected !== null) {
                    return;
                }
                const answer = button.getAttribute('data-answer') ?? '';
                paint(answer);
            });
        });

        const nextButton = host.querySelector<HTMLButtonElement>('[data-action="next-card"]');
        if (nextButton) {
            nextButton.addEventListener('click', () => {
                callbacks.onNext();
            });
        }

        const sourceButton = host.querySelector<HTMLButtonElement>('[data-action="open-source"]');
        if (sourceButton) {
            sourceButton.addEventListener('click', () => {
                callbacks.onOpenSource(card.source.videoId, card.source.timestamp);
            });
        }
    };

    paint(null);
};

export { renderSingleCard };
