# Automated testing

This repo now has a Playwright smoke-regression suite for the browser extension.

## Commands

- `npm run test:e2e` — builds `extension/dist/` and runs the extension tests in Chromium. A browser window opens because extension service workers are more reliable in headed Chromium.
- `npm run test:e2e:headed` — explicit headed-mode alias for debugging.
- `npm run typecheck` — validates both the extension and the Cloudflare Worker.
- `npm run verify` — lint, typecheck, build, then run the E2E suite. CI runs it under `xvfb`.
- `npm run test:ci` — alias for `npm run verify`.

If Playwright browsers are missing on a fresh machine, run:

```sh
npx playwright install chromium
```

## What is covered

- `tests/e2e/content.spec.ts` loads the built extension into Chromium and serves mocked `youtube.com/watch` pages. It covers UI injection, note creation, editing, deletion, keyboard shortcut creation, enabled/disabled storage changes, and Zen mode behavior.
- `tests/e2e/popup.spec.ts` seeds `chrome.storage.local` and opens the real extension popup. It covers note rendering/search, settings persistence, note/video deletion, markdown export, and backup import merging/deduplication.
- `tests/e2e/notes-page.spec.ts` opens the full saved-notes page. It covers notes-page rendering, flashcard API-key prompting, insufficient-note handling, and cached flashcard gameplay.

## How to add coverage

1. Add a test for every high-value user flow when you add/change a feature.
2. Prefer mocked pages/API responses over real YouTube or real network calls; tests should be deterministic.
3. Assert both UI behavior and persisted storage when a feature writes to `chrome.storage.local`.
4. Keep a short manual checklist only for things automation cannot reliably verify, such as final Web Store packaging checks.
