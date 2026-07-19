# Video placement design

Status: implemented as an experimental feature on `agent/custom-video-placement`.

## Current scope

- Support YouTube long-form videos first.
- Keep the content script restricted to YouTube.
- Defer YouTube Shorts and short-form feeds.
- Keep YouTube-specific features such as Zen mode and theater mode unchanged.
- Do not add floating or docked notes panels.

## Agreed placement direction

Use browser-standard video behavior internally where practical, while retaining
YouTube fallbacks for reliability.

1. Find ordinary `video` elements and score visible candidates by playback
   state, rendered area, landscape orientation, and proximity to 16:9.
2. Prefer the dominant long-form video. Fall back to YouTube's current video
   selector when generic detection is inconclusive.
3. Walk up from the video to identify an outer player container that
   participates in normal document flow.
4. Insert one notes panel after that container with a 24 px top margin. Do not
   position it from viewport coordinates, because that would overlap existing
   page content instead of creating space.
5. Fall back to the current YouTube metadata insertion point when a safe outer
   player container cannot be identified confidently.
6. Use standard media properties and events for duration, current time,
   playback, and annotations. Keep YouTube-specific behavior isolated.

## Custom placement concept

Automatic placement remains the default. A user may optionally enter a
placement mode and choose where the inline notes panel belongs.

Prefer choosing a valid gap before or after a page section over choosing an
arbitrary pixel. Placement mode highlights candidate gaps, shows a small
panel placeholder, and lets the user preview, confirm, cancel, or restore the
automatic position.

Implemented entry points:

1. A **Move panel** action inside the existing notes panel.
2. A **Choose panel position** action in the extension popup, also usable when
   automatic placement fails.

The page-corner Video Notes icon remains deferred.

The first two avoid adding a persistent floating page control. The page-corner
icon can remain a later discoverability option.

## Persistence decisions

- Placement applies to all YouTube long-form videos as one YouTube-wide
  preference.
- Avoid relying only on a generated CSS path; YouTube can replace DOM nodes
  during navigation and can change its markup.
- Player placement is stored semantically. Other selected sections use a ranked
  list of unique selectors. If a saved anchor no longer resolves, use automatic
  placement without losing the saved preference.
- Reattach the panel when YouTube replaces the chosen anchor during in-page
  navigation.

## Implemented delivery order

1. Build and validate automatic long-form detection and placement.
2. Add a valid inline candidate picker and a **Move panel** action.
3. Persist the selected placement and provide **Reset to automatic**.
4. Accept user-selected inline page sections while restricting selection to
   normal-flow insertion points. Arbitrary screen coordinates remain excluded.
