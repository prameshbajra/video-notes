# Video Notes: Browser Extension

Video Notes injects a lightweight note workspace directly on YouTube watch pages, renders timeline markers, and ships a popup for searchable, timestamped annotations.

## Features
- Inline note editor above the title; `Alt/Option + N` opens it and pauses playback; save/delete/cancel flows resume playback.
- Timeline track beneath the header with hover previews and click-to-seek/edit.
- Popup dashboard lists every video, offers instant search across titles and note text, and opens tabs at saved timestamps.
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
├── tools/build.mjs        # Cleans dist, compiles TS, copies manifest/icons/popup assets
├── types/                 # Shared types
├── icons/                 # Extension icons
└── dist/                  # Build output (generated, do not edit)
```

## Build & Dev Commands
- `npm install`
- `npm run dev`: watch builds into `extension/dist/` (includes content script bundling).
- `npm run build`: clean dist, compile TS, and copy manifest/icons/popup assets to `extension/dist/`.
- `npm run typecheck`: strict TS validation.
- `npm run lint`: ESLint over `extension/**/*.{ts,js,mjs}`.
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
  }
}
```
Data stays local to the browser and is shared between the content script and popup.
