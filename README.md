# Video Notes

Video Notes is a lightweight YouTube companion: take timestamped annotations inline on `youtube.com/watch`, see them as timeline markers, and browse/search everything from the popup.

## Install

- **Chrome Web Store**: https://chromewebstore.google.com/detail/video-notes/phgnkidiglnijkpmmdjcgdkekfoelcom
- **Website with tour + install links**: https://prameshbajra.github.io/video-notes/
- **Demo video (60s)**: https://www.youtube.com/watch?v=rOi7xQ8DLpo

## Project structure

```
video-notes/
├── extension/              # MV3 browser extension (TypeScript)
│   ├── scripts/content/    # Content script modules injected into YouTube
│   ├── popup/              # Extension popup UI (HTML/CSS/TS)
│   ├── notes/              # Notes page assets
│   ├── background.ts       # Service worker
│   ├── tools/build.mjs     # Build pipeline
│   ├── dist/               # Build output (generated — do not edit)
│   └── manifest.json       # Extension manifest
├── worker/                 # Cloudflare Worker API for note sharing
│   ├── src/                # Worker source (TypeScript)
│   └── wrangler.toml       # Cloudflare config (KV bindings)
├── share/                  # Static share page (HTML/CSS/JS)
│   ├── index.html
│   ├── share.css
│   └── share.js
├── index.html              # Landing page
├── index.css
├── index.js
├── privacy.html            # Privacy policy
├── AGENTS.md               # Contributor guidance
└── package.json
```

## Local development

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- npm (comes with Node.js)

### Extension

```bash
# Install dependencies
npm install

# Watch mode — rebuilds on every file change
npm run dev

# One-time production build
npm run build

# Type checking
npm run typecheck

# Linting
npm run lint
```

Build output goes to `extension/dist/`. **Never edit files in `dist/` directly** — they are overwritten on every build.

### Load the extension in your browser

1. Run `npm run build` (or keep `npm run dev` running).
2. **Chrome / Edge / Brave**: Open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select the `extension/dist` folder.
3. **Firefox**: Open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `extension/dist/manifest.json`.

> **Important**: Point your browser at `extension/dist`, not `extension/`. The source files are TypeScript and won't load directly.

### Share API (Cloudflare Worker)

The sharing feature uses a Cloudflare Worker with KV storage.

```bash
cd worker

# Install worker dependencies
npm install

# Run locally (uses Miniflare)
npx wrangler dev

# Deploy to Cloudflare
npx wrangler deploy
```

### Share page (static)

The share page at `share/` is a standalone static site that displays shared notes. To preview it locally:

```bash
npx http-server ./share -p 8090 -c-1
```

Then open `http://localhost:8090/?id=<some-share-id>`.

To deploy to Cloudflare Pages:

```bash
npx wrangler pages deploy ./share --project-name=static-video-notes
```

The share page is also served via GitHub Pages at `https://prameshbajra.github.io/video-notes/share/`.

### Landing page

The repo root contains the static landing/marketing page. Serve it with any static server:

```bash
npx http-server . -p 3000
# or
python3 -m http.server 3000
```

Then open `http://localhost:3000`.

## Packaging for release

```bash
# Chrome — produces dist-chrome.zip
npm run zip-chrome

# Firefox — produces dist-fire.zip
npm run zip-fire
```

You can also lint the extension package before submitting:

```bash
npx web-ext lint --source-dir extension/dist
```

## Smoke testing with web-ext

```bash
# Launch in Chromium
npx web-ext run --source-dir extension/dist --target chromium

# Launch in Firefox
npx web-ext run --source-dir extension/dist --target firefox-desktop
```

## Tech stack

- **Extension**: TypeScript, Chrome Extensions Manifest V3, esbuild
- **Share API**: Cloudflare Workers, KV storage
- **Share page**: Vanilla HTML/CSS/JS, YouTube IFrame API
- **Landing page**: Static HTML/CSS/JS
- **Hosting**: GitHub Pages (landing + share page), Cloudflare (Worker API + Pages)
