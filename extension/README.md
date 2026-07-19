# Video Notes: Browser Extension

Video Notes injects a lightweight note workspace directly on YouTube watch pages, renders timeline markers, and ships a popup for searchable, timestamped annotations.

## Features
- Separate text and drawing capture: `Alt/Option + N` opens the note editor, while the secondary Annotate button or `Alt/Option + A` opens a sketch canvas over the paused video. The annotation setting hides the global button and shortcut without removing existing drawings.
- Drawing annotations include pen, shapes, arrows, text, an object eraser, color/stroke controls, undo/redo (`Ctrl/Cmd+Z`, tool hotkeys `V P T L A R O E`), and a movable toolbar. Done or `Ctrl/Cmd+Enter` saves a standalone annotation; Esc cancels it, and an empty Done exits without saving. Choosing Add drawing from an unsaved text draft switches modes without saving the draft, and selecting an existing annotation opens its canvas directly with a Delete action. Annotations get a ring on the timeline dot, an image in the hover preview, a badge in the popup, and an exact-frame overlay on shared pages. The Fabric.js editor is dynamically imported so ordinary text notes do not load or open the drawing surface.
- Annotation-heavy libraries use the extension's unlimited local-storage permission. Save failures remain visible and keep the current editor open for retry.
- Timeline track beneath the header with hover previews and click-to-seek/edit.
- Automatic inline placement detects the dominant long-form HTML video, inserts the panel 24 px below a safe player container, and retains the previous YouTube metadata location as the final fallback. The panel's Move action or popup settings can start a visual position picker; custom positions are saved browser-locally and can be reset to automatic.
- Popup dashboard lists every video, offers instant search across titles and note text, and opens tabs at saved timestamps.
- Optional flashcards on the new tab: when enabled, a background listener redirects freshly opened tabs to a one-card flashcard page (independent settings toggle; needs the `tabs` permission, a Gemini key, and 6+ notes). If the key is missing, the new-tab page shows inline Gemini-key onboarding; when off, your browser's native new tab is left untouched. The deck cache is warmed on enable / key-save and refreshed stale-while-revalidate.
- Light/dark adapts to YouTube theme signals; storage is local via `chrome.storage.local` (`videoNotes:*` namespaces).

## Project Structure
```text
.
├── manifest.json          # Declares popup, service worker entry, and YouTube content script
├── background.ts          # MV3 worker placeholder
├── scripts/content/       # Content script modules (entry: index.ts)
├── popup/                 # Popup UI assets
│   ├── popup.html
│   ├── popup.css
│   └── ts/                # Popup TS modules (entry: popup.ts)
├── newtab/                # New-tab page: clock + one flashcard
│   ├── newtab.html
│   ├── newtab.css
│   └── ts/                # New-tab TS modules (entry: newtab.ts)
├── tools/build.mjs        # Cleans dist, compiles TS, copies manifest/icons/popup/newtab assets
├── types/                 # Shared types
├── icons/                 # Extension icons
└── dist/                  # Build output (generated, do not edit)
```

## Build & Dev Commands
- `npm install`
- `npm run dev`: watch builds into `extension/dist/` (includes content script bundling).
- `npm run build`: clean dist, compile TS, and copy manifest/icons/popup assets to `extension/dist/`.
- `npm run typecheck:extension`: strict extension TS validation.
- `npm run typecheck`: strict extension + Worker TS validation.
- `npm run lint`: ESLint over `extension/**/*.{ts,js,mjs}`.
- `npm run test:e2e`: build and run Playwright extension smoke-regression tests.
- `npm run verify`: lint, typecheck, build, and run Playwright tests.
- `npm run test:ci`: alias for `npm run verify`.
- Optional: `npx web-ext run --source-dir extension/dist --target chromium|firefox-desktop` to smoke-test; `npx web-ext lint --source-dir extension/dist` before packaging.
- Formatting (when needed): `npx prettier@latest --write extension/scripts/**/*.ts extension/popup/**/*.ts extension/background.ts`.

## Load as an unpacked extension
1. Build once (`npm run build`) or keep `npm run dev` running.
2. **Chromium (Chrome/Edge/Brave):** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `extension/dist/`.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and choose `extension/dist/manifest.json`. Update `browser_specific_settings.gecko.id` if you need a different ID for signing.

## Storage Model
```json
{
  "videoNotes:notes": {
    "<videoId>": [
      {
        "id": "note-id",
        "timestamp": 123.45,
        "text": "Key insight",
        "createdAt": 1698888888888,
        "updatedAt": 1698889999999
      }
    ]
  },
  "videoNotes:metadata": {
    "<videoId>": {
      "title": "Published video title",
      "noteCount": 3,
      "updatedAt": 1698889999999
    }
  },
  "videoNotes:placement": {
    "version": 1,
    "mode": "custom",
    "position": "after",
    "anchor": {
      "kind": "element",
      "selectors": ["#title"]
    },
    "updatedAt": 1698889999999
  }
}
```
Data stays local to the browser and is shared between the content script and popup.
