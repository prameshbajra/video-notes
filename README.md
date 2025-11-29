# Video Notes

Video Notes is a lightweight YouTube companion: take timestamped annotations inline on `youtube.com/watch`, see them as timeline markers, and browse/search everything from the popup.

## What’s in this repo
- `extension/`: Manifest V3 Chrome/Chromium + Firefox extension written in TypeScript. `scripts/content.ts` injects the notes UI, `popup/popup.ts` powers the action popup, `background.ts` is a placeholder worker, and build outputs go to `extension/dist/`.
- Static landing page at the repo root (`index.html`, `index.css`, `index.js`, `privacy.html`) that explains the feature tour and links to installs.
- Contributor guidance lives in `AGENTS.md`; deeper architecture notes are in `extension/README.md`.

## Install / try it
- Chrome Web Store: https://chromewebstore.google.com/detail/video-notes/phgnkidiglnijkpmmdjcgdkekfoelcom
- Website with tour + install links: https://prameshbajra.github.io/video-notes/
- Demo video (60s): https://www.youtube.com/watch?v=rOi7xQ8DLpo

## Develop locally
1. `npm install`
2. `npm run dev` for TypeScript watch output into `extension/dist/`.
3. `npm run build` to clean/copy assets and produce a fresh `extension/dist/`.
4. Checks: `npm run typecheck` (strict TS) and `npm run lint` (ESLint).
5. Optional: `npx web-ext run --source-dir extension/dist --target chromium|firefox-desktop` to smoke-test, `npx web-ext lint --source-dir extension/dist` before packaging.

## Load the extension for testing
1. Run `npm run build` (or keep `npm run dev` running).
2. **Chromium (Chrome/Edge/Brave):** open `chrome://extensions`, enable **Developer mode**, click **Load unpacked**, and select `extension/dist`.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `extension/dist/manifest.json`. The manifest declares `browser_specific_settings.gecko.id` (`video-notes@prameshbajra`).

## Landing page
Serve the repo root with any static server (e.g. `npx serve .` or `python3 -m http.server`) or just open `index.html`.
