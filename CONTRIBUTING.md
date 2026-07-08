# Contributing to Video Notes

Thanks for your interest in improving Video Notes! This guide covers how to propose changes so they can be reviewed and merged smoothly. For deeper repository conventions (project layout, coding style, testing), see [`AGENTS.md`](AGENTS.md); for how releases reach the stores, see [`docs/PUBLISHING.md`](docs/PUBLISHING.md).

## Ways to contribute
- **Report a bug or request a feature** by opening an issue. Include steps to reproduce, the browser + version, and screenshots or a short clip where relevant.
- **Send a pull request** for fixes, features, docs, or tests.

## Development setup
1. `npm install`
2. `npm run dev` — watch builds into `extension/dist/`.
3. Load the unpacked build from `extension/dist/` (see the [README](README.md#load-the-extension-for-testing) for the Chromium and Firefox steps).

`extension/dist/` is generated — never edit it by hand.

## Workflow

Direct pushes to `main` are reserved for maintainers, and external contributors don't have write access — so the flow is **fork → branch → pull request**:

1. **Fork** the repo and clone your fork.
2. **Branch** off `main`. Use a short, kebab-case name prefixed by intent:
   - `feature-<what>` — new functionality (e.g. `feature-newtab-flashcards`)
   - `fix-<what>` — bug fixes (e.g. `fix-firefox-listing-docs`)
   - `perf-<what>`, `refactor-<what>`, `docs-<what>`, `chore-<what>` — as appropriate
3. Make focused commits (see below).
4. **Run the checks locally** and make sure they pass (details below).
5. **Open a PR** against `main` from your branch.

Keep each PR focused on one logical change — smaller PRs are faster to review and safer to merge.

## Before you open a PR

Run the full verification suite — this is exactly what CI runs, so a green run locally means a green run in CI:

```bash
npm run verify   # lint + typecheck (extension & Worker) + build + Playwright e2e
```

Faster partial checks while iterating:

```bash
npm run lint
npm run typecheck
npm run test:e2e
```

If your change affects browser packaging or store behavior, also smoke-test the built extension in Chromium and Firefox (`npx web-ext run --source-dir extension/dist --target chromium|firefox-desktop`).

## Commit messages
- Write a concise, **imperative** subject line, capitalized, with no trailing period (e.g. *"Paginate video and note lists"*, *"Point install CTAs at the visitor's browser store"*).
- Aim for ~50 characters in the subject; add a body explaining the **why** when the change isn't self-evident.
- Reference issues in the body when applicable (e.g. `Fixes #12`).

## Pull request expectations
A good PR includes:
- A clear description of **what** changed and **why**.
- **Testing notes** — what you ran and what you verified.
- **Screenshots or a short GIF** for any UI change.
- Passing CI. Every PR runs `.github/workflows/ci.yml` (`npm run verify`); the check must be green before a maintainer merges.

A maintainer will review and merge (usually via a merge commit). Please be responsive to review feedback.

## Coding style (quick reference)
Full details are in [`AGENTS.md`](AGENTS.md). In short:
- 4-space indentation.
- TypeScript with explicit return types, `type` imports, and `interface` for type shapes.
- Prefer `const`, arrow callbacks, template strings, and strict equality (`===`).
- Prefix intentionally-unused parameters/vars with `_`.
- Avoid `any` unless truly unavoidable.
- Don't break storage migrations — local storage uses `chrome.storage.local` with `videoNotes:*` namespaces.

## Releasing
Publishing to the Chrome Web Store and Firefox AMO is automated and handled by maintainers via a version tag. Contributors don't need to touch this — see the [Releasing section of the README](README.md#releasing-chrome-web-store--firefox-amo) and [`docs/PUBLISHING.md`](docs/PUBLISHING.md) for the details.
