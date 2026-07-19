const CONTAINER_ID = 'video-notes-container';
const TRACK_ID = 'video-notes-track';
const TOOLTIP_ID = 'video-notes-tooltip';
const PREVIEW_TOOLTIP_ID = 'video-notes-preview';
const TRACK_HOVER_TOOLTIP_ID = 'video-notes-track-hover';
const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ENABLED_STORAGE_KEY = 'videoNotes:enabled';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const ANNOTATIONS_ENABLED_STORAGE_KEY = 'videoNotes:annotationsEnabled';
const PLACEMENT_STORAGE_KEY = 'videoNotes:placement';
const ZEN_MODE_STYLE_ID = 'video-notes-zen-style';
const PLACEMENT_ROOT_ID = 'video-notes-placement-root';
const ANNOTATION_ROOT_ID = 'video-notes-annotation-root';
const ANNOTATION_STYLE_ID = 'video-notes-annotation-style';
const OBSERVER_OPTIONS = { childList: true, subtree: true };
const VIDEO_EVENTS = ['loadedmetadata', 'durationchange'];
const TOOLTIP_OFFSET = 12;
const PREVIEW_OFFSET = 8;
const START_PLACEMENT_MESSAGE = 'VIDEO_NOTES_START_PLACEMENT';
const RESET_PLACEMENT_MESSAGE = 'VIDEO_NOTES_RESET_PLACEMENT';

export {
    ANNOTATION_ROOT_ID,
    ANNOTATION_STYLE_ID,
    ANNOTATIONS_ENABLED_STORAGE_KEY,
    CONTAINER_ID,
    ENABLED_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    OBSERVER_OPTIONS,
    PLACEMENT_ROOT_ID,
    PLACEMENT_STORAGE_KEY,
    PREVIEW_OFFSET,
    PREVIEW_TOOLTIP_ID,
    RESET_PLACEMENT_MESSAGE,
    START_PLACEMENT_MESSAGE,
    TOOLTIP_ID,
    TOOLTIP_OFFSET,
    TRACK_HOVER_TOOLTIP_ID,
    TRACK_ID,
    VIDEO_EVENTS,
    ZEN_MODE_STORAGE_KEY,
    ZEN_MODE_STYLE_ID
};
