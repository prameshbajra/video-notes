const NOTES_STORAGE_KEY = 'videoNotes:notes';
const METADATA_STORAGE_KEY = 'videoNotes:metadata';
const ENABLED_STORAGE_KEY = 'videoNotes:enabled';
const ZEN_MODE_STORAGE_KEY = 'videoNotes:zenMode';
const MD_EXPORT_ENABLED_STORAGE_KEY = 'videoNotes:mdExportEnabled';
const MD_TEMPLATE_STORAGE_KEY = 'videoNotes:mdTemplate';
const DELETE_HOLD_ENABLED_STORAGE_KEY = 'videoNotes:deleteHoldEnabled';
const DEFAULT_MD_TEMPLATE = '[*video-title*](*youtube-url*)\n\n- *time-url*: *note*';
const HOLD_DURATION_MS = 2000;
const VIEW_NOTES = 'notes';
const VIEW_SETTINGS = 'settings';
const VIEW_CONTEXT_PAGE = 'page';
const SETTINGS_MESSAGE_STATES = ['settings-message--success', 'settings-message--error'] as const;

export {
    DEFAULT_MD_TEMPLATE,
    DELETE_HOLD_ENABLED_STORAGE_KEY,
    ENABLED_STORAGE_KEY,
    HOLD_DURATION_MS,
    MD_EXPORT_ENABLED_STORAGE_KEY,
    MD_TEMPLATE_STORAGE_KEY,
    METADATA_STORAGE_KEY,
    NOTES_STORAGE_KEY,
    SETTINGS_MESSAGE_STATES,
    VIEW_CONTEXT_PAGE,
    VIEW_NOTES,
    VIEW_SETTINGS,
    ZEN_MODE_STORAGE_KEY
};
