# Video Notes

Video Notes is a lightweight YouTube companion that ships two pieces from this repo:

- `extension/` &mdash; a Manifest V3 Chrome/Chromium + Firefox extension that injects an inline note workspace, timeline markers, and a popup dashboard for searchable, timestamped annotations.
- `landing/` &mdash; a static page (HTML/CSS/JS only) used for sharing the feature tour and installation instructions.

## Quick start

### Install
Install it from the web store: https://chromewebstore.google.com/detail/video-notes/phgnkidiglnijkpmmdjcgdkekfoelcom

or from the website : https://prameshbajra.github.io/video-notes/

### Demo video
60-second video: https://www.youtube.com/watch?v=rOi7xQ8DLpo


### Extension
1. Install deps and build: run `npm install`, then `npm run build` (outputs to `extension/dist`). Optional sanity checks: `npm run typecheck`, `npm run lint`.
2. **Chromium (Chrome/Edge/Brave):** open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select `extension/dist`; the content script activates automatically on `youtube.com/watch`.
3. **Firefox:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on**, and pick `extension/dist/manifest.json`. The manifest already includes `browser_specific_settings` for Firefox (`video-notes@prameshbajra`); change it if you prefer a different ID before signing/uploading.
4. For a deeper dive into storage, popup behavior, helper scripts, and the TypeScript build, see `extension/README.md`.

### Landing page
2. Serve the root folder with any static server, e.g. `npx serve .` or `python3 -m http.server` or just open `index.html` in your browser like we are in the 90s.
3. Deploys cleanly to any static host (GitHub Pages) because it has no build step or dependencies.
