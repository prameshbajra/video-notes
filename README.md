# Video Notes

Video Notes is a lightweight YouTube companion that ships two pieces from this repo:

- `extension/` &mdash; a Manifest V3 Chrome/Chromium extension that injects an inline note workspace, timeline markers, and a popup dashboard for searchable, timestamped annotations.
- `landing/` &mdash; a static page (HTML/CSS/JS only) used for sharing the feature tour and installation instructions.

## Quick start

### Install
Install it from the web store: https://chromewebstore.google.com/detail/video-notes/phgnkidiglnijkpmmdjcgdkekfoelcom

or from the website : https://prameshbajra.github.io/video-notes/

### Demo video
60-second video: https://www.youtube.com/watch?v=rOi7xQ8DLpo


### Extension
1. Open `chrome://extensions`, enable **Developer mode**, and choose **Load unpacked**.
2. Select the `extension` folder. The content script activates automatically on `youtube.com/watch`.
3. For a deeper dive into storage, popup behavior, and helper scripts, see `extension/README.md`.

### Landing page
2. Serve the root folder with any static server, e.g. `npx serve .` or `python3 -m http.server` or just open `index.html` in your browser like we are in the 90s.
3. Deploys cleanly to any static host (GitHub Pages) because it has no build step or dependencies.

