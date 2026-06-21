# Publishing Video Notes

How to release the extension to the **Chrome Web Store** and **Firefox AMO**.

- Chrome is an **update** to an existing listing (`phgnkidiglnijkpmmdjcgdkekfoelcom`).
- Firefox is (as of v2.3.0) a **new** listing — the first version must be created by hand; CI handles every release after that.
- Privacy policy URL (required by both): https://prameshbajra.github.io/video-notes/privacy.html

---

## Release flow (the short version)

1. Bump the version in **`extension/manifest.json`** and **`package.json`** (keep them equal). Stores reject re-uploading a version that is already live.
2. Open a PR, get CI green, merge to `main`.
3. Tag the merge commit and push it:
   ```bash
   git tag v2.3.0
   git push origin v2.3.0
   ```
4. The **`.github/workflows/release.yml`** workflow builds, packages, and publishes to both stores. (It fails fast if the tag doesn't match the manifest version.)

You can also run it manually from the **Actions → Release → Run workflow** menu and pick `chrome`, `firefox`, or `both`.

---

## One-time setup: GitHub secrets

Add these under **Settings → Secrets and variables → Actions**.

### Chrome Web Store
| Secret | What it is |
| --- | --- |
| `CWS_EXTENSION_ID` | `phgnkidiglnijkpmmdjcgdkekfoelcom` |
| `CWS_CLIENT_ID` | OAuth client ID |
| `CWS_CLIENT_SECRET` | OAuth client secret |
| `CWS_REFRESH_TOKEN` | OAuth refresh token |

To get the OAuth values: create a Google Cloud project, enable the **Chrome Web Store API**, create an **OAuth client ID** of type *Desktop app*, then exchange a one-time auth code for a refresh token. The `chrome-webstore-upload` docs walk through it: <https://github.com/fregante/chrome-webstore-upload/blob/main/How%20to%20generate%20Google%20API%20keys.md>

### Firefox AMO
| Secret | What it is |
| --- | --- |
| `AMO_JWT_ISSUER` | API key (JWT issuer) |
| `AMO_JWT_SECRET` | API secret |

Generate them at **addons.mozilla.org → Tools → Manage API Keys**: <https://addons.mozilla.org/developers/addon/api/key/>

---

## Manual first-time / listing steps

CI uploads the package, but the **store listing** (description, screenshots, data disclosures) is edited in each dashboard.

### Chrome Web Store (update)
1. Bump the version, then `npm run zip-chrome` → `dist-chrome.zip` (CI does this for you on tag).
2. [Developer Dashboard](https://chrome.google.com/webstore/devconsole) → the item → **Package → Upload new package**.
3. **Privacy practices** tab — keep this current: declare that note text is sent to Google's Gemini API **only when the user enables flashcards and provides their own key**, justify each permission (see below), confirm no remote code, and set the privacy policy URL.
4. **Submit for review.** Adding the Gemini data flow / host permission can lengthen review.

### Firefox AMO (new listing)
1. `npx web-ext lint --source-dir extension/dist` (CI's linter; fix anything new). Current expected warnings are listed below.
2. `npm run zip-fire` → `dist-fire.zip`.
3. [Developer Hub](https://addons.mozilla.org/developers/) → **Submit a New Add-on** → upload → choose **On this site** (listed).
4. If asked for **source code**: the build bundles TypeScript via `node extension/tools/build.mjs`, so provide the repo plus build steps (`npm ci && npm run build`, output in `extension/dist`).
5. Fill the listing (summary, description, screenshots, categories), set the privacy policy URL, submit. Once the listed add-on exists, future versions go out automatically via `web-ext sign --channel listed` in CI.

---

## Listing copy

**Name:** Video Notes — Timestamped YouTube Notes

**Short description (≤132 chars):**
> Take timestamped notes on YouTube, jump back with one click, search them all, and review them as AI-made flashcards.

**Detailed description:**
> Video Notes turns YouTube into a place you can actually learn from.
>
> • Press one key (Alt+N / ⌥N) to capture a note anchored to the exact second you're watching — the video pauses while you type and resumes when you're done.
> • Every note becomes a marker on the timeline. Hover to preview, click to jump straight back to that moment.
> • Search every note across every video from the toolbar popup.
> • Share a clean, read-only page of a video's notes with one click — no account needed.
> • Review what you've watched: turn on flashcards and each new tab quizzes you with a multiple-choice question generated from your own notes (bring your own free Google Gemini key).
> • Zen mode hides distractions; export to Markdown for Obsidian or Notion.
>
> Private by default: your notes live in local browser storage. Nothing is uploaded unless you explicitly share a video or enable flashcards.

**What's new in 2.3.0:**
> New: flashcards on every new tab. Enable them and add a free Gemini API key, and Video Notes turns your saved notes into multiple-choice quiz cards — answer, see the note it came from, and jump back to that second of the video.

---

## Permission justifications (for the review forms)

| Permission | Justification |
| --- | --- |
| `storage` | Stores your notes and settings locally in `chrome.storage.local`. |
| `tabs` | Opens a video at a note's timestamp in a new tab, and powers the new-tab flashcards page. |
| `content_scripts` on `youtube.com` | Injects the note editor, timeline markers, and controls on watch pages. |
| host `share-api.video-notes.workers.dev` | Sends a video's notes to the share API **only when the user clicks Share**, to mint a read-only link. |
| host `generativelanguage.googleapis.com` | Sends note text to Google's Gemini API to generate flashcards **only when the user enables flashcards and provides their own API key**. |

No remote code is executed; the bundle ships everything it runs.

---

## Pre-flight checklist

- [ ] Version bumped in `manifest.json` + `package.json` (and higher than what's live).
- [ ] `npm run verify` passes (lint, typecheck, e2e).
- [ ] `npx web-ext lint --source-dir extension/dist` shows **0 errors**.
- [ ] Privacy policy reflects the current data flows.

**Expected `web-ext lint` warnings (0 errors, ~14 warnings) — none block submission:**
- `UNSAFE_VAR_ASSIGNMENT` ×8 — `innerHTML` in flashcard rendering; values are passed through `escapeHtml()`.
- `KEY_FIREFOX_UNSUPPORTED_BY_MIN_VERSION` ×2 — the `data_collection_permissions` key (Firefox 140+); safely ignored on 115–139.
- `BACKGROUND_SERVICE_WORKER_IGNORED` ×1 — expected; the manifest declares both `service_worker` (Chrome) and `scripts` (Firefox).
- `ICON_SIZE_INVALID` ×3 — the `icon-16/48/128` PNGs are all 500×500; resize them to their declared dimensions to clear this.
