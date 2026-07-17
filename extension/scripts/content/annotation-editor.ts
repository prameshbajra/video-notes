import { Canvas, Ellipse, Line, Path, PencilBrush, Rect, Textbox } from 'fabric';
import type { FabricObject, TPointerEvent } from 'fabric';
import { ANNOTATION_ROOT_ID, ANNOTATION_STYLE_ID } from './constants.js';
import { applyStyles, getVideoElement, isEditableTarget } from './utils.js';

// Loaded on demand via dynamic import so Fabric.js stays out of the main
// content bundle. Stateful modules (state.js, theme.js) must NOT be imported
// here — this file bundles separately, so importing them would create second
// instances; the host object supplies them instead.

type AnnotationTool = 'select' | 'pen' | 'text' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'eraser';

interface PointerPosition {
    x: number;
    y: number;
}

interface DraftShape {
    tool: Extract<AnnotationTool, 'line' | 'arrow' | 'rect' | 'ellipse'>;
    start: PointerPosition;
    object: FabricObject;
}

interface AnnotationEditorState {
    root: HTMLDivElement | null;
    toolbar: HTMLDivElement | null;
    canvasElement: HTMLCanvasElement | null;
    canvas: Canvas | null;
    undoButton: HTMLButtonElement | null;
    redoButton: HTMLButtonElement | null;
    clearButton: HTMLButtonElement | null;
    strokeSizeDot: HTMLSpanElement | null;
    resizeObserver: ResizeObserver | null;
    activeTool: AnnotationTool;
    color: string;
    strokeWidth: number;
    draftShape: DraftShape | null;
    history: Record<string, unknown>[];
    historyIndex: number;
    isRestoringHistory: boolean;
    isPointerDown: boolean;
    eraserRemovedObject: boolean;
    viewportWidth: number;
    viewportHeight: number;
}

const DEFAULT_COLOR = '#ff453a';
const DEFAULT_STROKE_WIDTH = 4;
const MIN_SHAPE_SIZE = 3;
const COLOR_SWATCHES = ['#ff453a', '#facc15', '#22c55e', '#2563eb', '#ffffff', '#111827'];

const TOOL_DEFINITIONS: Array<{ tool: AnnotationTool; label: string; shortcut: string }> = [
    { tool: 'select', label: 'Select', shortcut: 'V' },
    { tool: 'pen', label: 'Pen', shortcut: 'P' },
    { tool: 'text', label: 'Text', shortcut: 'T' },
    { tool: 'line', label: 'Line', shortcut: 'L' },
    { tool: 'arrow', label: 'Arrow', shortcut: 'A' },
    { tool: 'rect', label: 'Rectangle', shortcut: 'R' },
    { tool: 'ellipse', label: 'Ellipse', shortcut: 'O' },
    { tool: 'eraser', label: 'Eraser', shortcut: 'E' }
];

const TOOL_SHORTCUTS: Record<string, AnnotationTool> = {
    v: 'select',
    p: 'pen',
    t: 'text',
    l: 'line',
    a: 'arrow',
    r: 'rect',
    o: 'ellipse',
    e: 'eraser'
};

const TOOL_CURSORS: Record<AnnotationTool, string> = {
    select: 'default',
    pen: 'crosshair',
    text: 'text',
    line: 'crosshair',
    arrow: 'crosshair',
    rect: 'crosshair',
    ellipse: 'crosshair',
    eraser: 'crosshair'
};

const svgIcon = (inner: string): string =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ` +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;

const TOOL_ICONS: Record<AnnotationTool, string> = {
    select: svgIcon('<path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/>'),
    pen: svgIcon('<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>'),
    text: svgIcon('<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>'),
    line: svgIcon('<path d="M5 19L19 5"/>'),
    arrow: svgIcon('<path d="M7 17L17 7"/><path d="M8 7h9v9"/>'),
    rect: svgIcon('<rect x="4" y="5" width="16" height="14" rx="2"/>'),
    ellipse: svgIcon('<ellipse cx="12" cy="12" rx="9" ry="6.5"/>'),
    eraser: svgIcon(
        '<path d="M21 21H8a2 2 0 0 1-1.42-.587l-3.994-3.999a2 2 0 0 1 0-2.828l10-10a2 2 0 0 1 2.829 0l5.999 6a2 2 0 0 1 0 2.828L12.834 21"/>' +
        '<path d="m5.082 11.09 8.828 8.828"/>'
    )
};

const ACTION_ICONS = {
    undo: svgIcon('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5 5.5 5.5 0 0 1-5.5 5.5H11"/>'),
    redo: svgIcon('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13"/>'),
    clear: svgIcon('<path d="M5 5l14 14"/><path d="M19 5 5 19"/>'),
    delete: svgIcon(
        '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/>' +
        '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M10 11v6"/><path d="M14 11v6"/>'
    ),
    done: svgIcon('<path d="M20 6 9 17l-5-5"/>'),
    grip:
        '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true">' +
        '<circle cx="9" cy="6" r="1.5"/><circle cx="15" cy="6" r="1.5"/>' +
        '<circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>' +
        '<circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/></svg>'
};

// Remembered across editor sessions on the same page so a moved toolbar
// stays where the user put it.
let toolbarPosition: { left: number; top: number } | null = null;

// Non-null while an existing annotation's scene is still loading onto the
// canvas; reads during that window return it unchanged.
let pendingLoadAnnotation: NoteAnnotation | null = null;

const editor: AnnotationEditorState = {
    root: null,
    toolbar: null,
    canvasElement: null,
    canvas: null,
    undoButton: null,
    redoButton: null,
    clearButton: null,
    strokeSizeDot: null,
    resizeObserver: null,
    activeTool: 'pen',
    color: DEFAULT_COLOR,
    strokeWidth: DEFAULT_STROKE_WIDTH,
    draftShape: null,
    history: [],
    historyIndex: -1,
    isRestoringHistory: false,
    isPointerDown: false,
    eraserRemovedObject: false,
    viewportWidth: 0,
    viewportHeight: 0
};

const createAnnotationEditor = (host: AnnotationEditorHost): AnnotationEditorApi => {
    const ensureAnnotationStyles = (): void => {
        const palette = host.getPalette();
        const accent = palette.accent;
        const css = `
#${ANNOTATION_ROOT_ID} .vn-ann-ring {
    position: absolute;
    inset: 0;
    border: 2px solid ${accent};
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.35);
    pointer-events: none;
    z-index: 1;
}
#${ANNOTATION_ROOT_ID} .vn-ann-toolbar {
    position: absolute;
    top: 10px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    align-items: stretch;
    gap: 8px;
    box-sizing: border-box;
    width: max-content;
    max-width: calc(100% - 16px);
    max-height: calc(100% - 20px);
    overflow: auto;
    padding: 8px 10px;
    background: rgba(18, 18, 18, 0.92);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 12px;
    backdrop-filter: blur(12px);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
    font-family: Roboto, Arial, sans-serif;
    pointer-events: auto;
    z-index: 2;
}
#${ANNOTATION_ROOT_ID} .vn-ann-grip {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    border-radius: 8px;
    color: rgba(255, 255, 255, 0.55);
    cursor: grab;
    touch-action: none;
    transition: background-color 120ms ease, color 120ms ease;
}
#${ANNOTATION_ROOT_ID} .vn-ann-grip:hover {
    background: rgba(255, 255, 255, 0.1);
    color: rgba(255, 255, 255, 0.85);
}
#${ANNOTATION_ROOT_ID} .vn-ann-grip--dragging {
    cursor: grabbing;
    background: rgba(255, 255, 255, 0.14);
    color: #ffffff;
}
#${ANNOTATION_ROOT_ID} .vn-ann-grip svg {
    width: 16px;
    height: 16px;
    display: block;
}
#${ANNOTATION_ROOT_ID} .vn-ann-rows {
    display: flex;
    flex-direction: column;
    gap: 8px;
    min-width: 0;
}
#${ANNOTATION_ROOT_ID} .vn-ann-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 10px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-group {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-group--swatches {
    gap: 9px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-sep {
    width: 1px;
    height: 24px;
    background: rgba(255, 255, 255, 0.18);
    margin: 0 2px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-btn {
    width: 32px;
    height: 32px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid transparent;
    border-radius: 8px;
    background: transparent;
    color: #f1f1f1;
    cursor: pointer;
    transition: background-color 120ms ease, border-color 120ms ease, color 120ms ease;
}
#${ANNOTATION_ROOT_ID} .vn-ann-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.14);
}
#${ANNOTATION_ROOT_ID} .vn-ann-btn--active {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.5);
    color: #ffffff;
}
#${ANNOTATION_ROOT_ID} .vn-ann-btn:disabled {
    opacity: 0.35;
    cursor: default;
}
#${ANNOTATION_ROOT_ID} .vn-ann-btn svg {
    width: 18px;
    height: 18px;
    display: block;
}
#${ANNOTATION_ROOT_ID} .vn-ann-swatch {
    width: 20px;
    height: 20px;
    padding: 0;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.4);
    cursor: pointer;
    transition: transform 120ms ease, box-shadow 120ms ease;
}
#${ANNOTATION_ROOT_ID} .vn-ann-swatch--active {
    box-shadow: 0 0 0 2px rgba(15, 15, 15, 0.9), 0 0 0 4px #ffffff;
    transform: scale(1.05);
}
#${ANNOTATION_ROOT_ID} .vn-ann-slider {
    width: 72px;
    accent-color: #ffffff;
    cursor: pointer;
}
#${ANNOTATION_ROOT_ID} .vn-ann-size-dot {
    display: inline-block;
    border-radius: 999px;
    background: #ffffff;
    margin-left: 2px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-done {
    height: 32px;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 0 14px;
    border: none;
    border-radius: 8px;
    background: ${accent};
    color: #ffffff;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: filter 120ms ease;
}
#${ANNOTATION_ROOT_ID} .vn-ann-done:hover {
    filter: brightness(1.1);
}
#${ANNOTATION_ROOT_ID} .vn-ann-done svg {
    width: 16px;
    height: 16px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-delete-note {
    height: 32px;
    display: none;
    align-items: center;
    gap: 6px;
    padding: 0 10px;
    border: 1px solid rgba(248, 113, 113, 0.5);
    border-radius: 8px;
    background: rgba(127, 29, 29, 0.42);
    color: #fecaca;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
}
#${ANNOTATION_ROOT_ID} .vn-ann-delete-note:hover {
    background: rgba(153, 27, 27, 0.68);
}
#${ANNOTATION_ROOT_ID} .vn-ann-delete-note svg {
    width: 15px;
    height: 15px;
}
#${ANNOTATION_ROOT_ID} .vn-ann-hint {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 6px 12px;
    border-radius: 999px;
    background: rgba(18, 18, 18, 0.85);
    border: 1px solid rgba(255, 255, 255, 0.12);
    color: rgba(255, 255, 255, 0.92);
    font-family: Roboto, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.2;
    white-space: nowrap;
    pointer-events: none;
    z-index: 2;
}
#${ANNOTATION_ROOT_ID} .vn-ann-error {
    position: absolute;
    right: 12px;
    bottom: 12px;
    max-width: min(360px, calc(100% - 24px));
    padding: 8px 12px;
    border-radius: 8px;
    background: rgba(127, 29, 29, 0.96);
    border: 1px solid rgba(254, 202, 202, 0.35);
    color: #ffffff;
    font-family: Roboto, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.4;
    pointer-events: none;
    z-index: 3;
}
`;

        const existing = document.getElementById(ANNOTATION_STYLE_ID);
        if (existing instanceof HTMLStyleElement) {
            existing.textContent = css;
            return;
        }

        const styleElement = document.createElement('style');
        styleElement.id = ANNOTATION_STYLE_ID;
        styleElement.textContent = css;
        (document.head || document.documentElement).appendChild(styleElement);
    };

    const getPlayerElement = (): HTMLElement | null => {
        const player = document.getElementById('player');
        if (player instanceof HTMLElement) {
            return player;
        }

        const video = getVideoElement();
        if (video && video.parentElement instanceof HTMLElement) {
            return video.parentElement;
        }

        return video;
    };

    const getOverlayRect = (): DOMRect | null => {
        const player = getPlayerElement();
        const video = getVideoElement();
        const playerRect = player ? player.getBoundingClientRect() : null;
        if (playerRect && playerRect.width > 0 && playerRect.height > 0) {
            return playerRect;
        }

        const videoRect = video ? video.getBoundingClientRect() : null;
        if (videoRect && videoRect.width > 0 && videoRect.height > 0) {
            return videoRect;
        }

        return null;
    };

    const setButtonActiveState = (): void => {
        if (!editor.toolbar) {
            return;
        }

        const toolButtons = editor.toolbar.querySelectorAll<HTMLButtonElement>('[data-annotation-tool]');
        toolButtons.forEach((button) => {
            const isActiveTool = button.dataset.annotationTool === editor.activeTool;
            button.setAttribute('aria-pressed', String(isActiveTool));
            button.classList.toggle('vn-ann-btn--active', isActiveTool);
        });
    };

    const updateBrush = (): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        if (!canvas.freeDrawingBrush) {
            canvas.freeDrawingBrush = new PencilBrush(canvas);
        }

        canvas.freeDrawingBrush.color = editor.color;
        canvas.freeDrawingBrush.width = editor.strokeWidth;
    };

    const updateStrokeSizeDot = (): void => {
        if (!editor.strokeSizeDot) {
            return;
        }

        const size = Math.max(4, Math.min(16, editor.strokeWidth));
        editor.strokeSizeDot.style.width = `${size}px`;
        editor.strokeSizeDot.style.height = `${size}px`;
    };

    const updateHistoryButtons = (): void => {
        const objectCount = editor.canvas ? editor.canvas.getObjects().length : 0;
        if (editor.undoButton) {
            editor.undoButton.disabled = editor.historyIndex <= 0;
        }
        if (editor.redoButton) {
            editor.redoButton.disabled = editor.historyIndex >= editor.history.length - 1;
        }
        if (editor.clearButton) {
            editor.clearButton.disabled = objectCount === 0;
        }
        if (editor.root) {
            editor.root.dataset.annotationObjects = String(objectCount);
        }
    };

    const setObjectsSelectable = (isSelectable: boolean): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        canvas.getObjects().forEach((object) => {
            object.set({
                selectable: isSelectable,
                evented: true
            });
        });
    };

    const applyToolCursor = (): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        const cursor = TOOL_CURSORS[editor.activeTool];
        canvas.defaultCursor = cursor;
        canvas.freeDrawingCursor = 'crosshair';
        canvas.hoverCursor =
            editor.activeTool === 'select' ? 'move' : editor.activeTool === 'eraser' ? 'pointer' : cursor;
        canvas.setCursor(cursor);
    };

    const setActiveTool = (tool: AnnotationTool): void => {
        const canvas = editor.canvas;
        editor.activeTool = tool;

        if (canvas) {
            canvas.isDrawingMode = tool === 'pen';
            canvas.selection = tool === 'select';
            setObjectsSelectable(tool === 'select');
            if (tool !== 'select') {
                canvas.discardActiveObject();
            }
            updateBrush();
            applyToolCursor();
            canvas.requestRenderAll();
        }

        setButtonActiveState();
    };

    const captureHistory = (): void => {
        const canvas = editor.canvas;
        if (!canvas || editor.isRestoringHistory) {
            return;
        }

        const snapshot = canvas.toJSON() as unknown as Record<string, unknown>;
        editor.history = editor.history.slice(0, editor.historyIndex + 1);
        editor.history.push(snapshot);
        editor.historyIndex = editor.history.length - 1;
        updateHistoryButtons();
    };

    const resetHistory = (): void => {
        editor.history = [];
        editor.historyIndex = -1;
        captureHistory();
    };

    const loadHistorySnapshot = (snapshot: Record<string, unknown>): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        editor.isRestoringHistory = true;
        canvas.loadFromJSON(snapshot)
            .then(() => {
                setObjectsSelectable(editor.activeTool === 'select');
                canvas.requestRenderAll();
            })
            .finally(() => {
                editor.isRestoringHistory = false;
                updateHistoryButtons();
            })
            .catch(() => {
                editor.isRestoringHistory = false;
            });
    };

    const undoAnnotation = (): void => {
        if (editor.historyIndex <= 0) {
            return;
        }

        editor.historyIndex -= 1;
        const snapshot = editor.history[editor.historyIndex];
        if (snapshot) {
            loadHistorySnapshot(snapshot);
        }
        updateHistoryButtons();
    };

    const redoAnnotation = (): void => {
        if (editor.historyIndex >= editor.history.length - 1) {
            return;
        }

        editor.historyIndex += 1;
        const snapshot = editor.history[editor.historyIndex];
        if (snapshot) {
            loadHistorySnapshot(snapshot);
        }
        updateHistoryButtons();
    };

    const clearAnnotation = (): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        const objects = canvas.getObjects();
        if (objects.length === 0) {
            return;
        }

        canvas.remove(...objects);
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        captureHistory();
    };

    const removeSelectedObjects = (): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        const activeObjects = canvas.getActiveObjects();
        if (activeObjects.length === 0) {
            return;
        }

        activeObjects.forEach((object) => {
            canvas.remove(object);
        });
        canvas.discardActiveObject();
        canvas.requestRenderAll();
        captureHistory();
    };

    const createToolbarButton = (label: string, tool: AnnotationTool, shortcut: string): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vn-ann-btn';
        button.innerHTML = TOOL_ICONS[tool];
        button.dataset.annotationTool = tool;
        button.title = `${label} — ${shortcut}`;
        button.setAttribute('aria-label', `Annotation ${label}`);
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            setActiveTool(tool);
        });
        return button;
    };

    const createActionButton = (
        label: string,
        icon: string,
        title: string,
        action: () => void
    ): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vn-ann-btn';
        button.innerHTML = icon;
        button.title = title;
        button.setAttribute('aria-label', `Annotation ${label}`);
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            action();
        });
        return button;
    };

    const createColorSwatch = (color: string): HTMLButtonElement => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'vn-ann-swatch';
        button.classList.toggle('vn-ann-swatch--active', color === editor.color);
        button.style.backgroundColor = color;
        button.title = 'Drawing color';
        button.setAttribute('aria-label', `Use annotation color ${color}`);
        button.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            editor.color = color;
            updateBrush();
            if (editor.toolbar) {
                editor.toolbar.querySelectorAll<HTMLButtonElement>('[data-annotation-color]').forEach((swatch) => {
                    swatch.classList.toggle('vn-ann-swatch--active', swatch.dataset.annotationColor === color);
                });
            }
        });
        button.dataset.annotationColor = color;
        return button;
    };

    const clampToolbarPosition = (left: number, top: number): { left: number; top: number } => {
        const root = editor.root;
        const toolbar = editor.toolbar;
        if (!root || !toolbar) {
            return { left, top };
        }

        const rootRect = root.getBoundingClientRect();
        const toolbarRect = toolbar.getBoundingClientRect();
        const maxLeft = Math.max(4, rootRect.width - toolbarRect.width - 4);
        const maxTop = Math.max(4, rootRect.height - toolbarRect.height - 4);
        return {
            left: Math.min(Math.max(left, 4), maxLeft),
            top: Math.min(Math.max(top, 4), maxTop)
        };
    };

    const applyToolbarPosition = (): void => {
        const toolbar = editor.toolbar;
        if (!toolbar || !toolbarPosition) {
            return;
        }

        toolbarPosition = clampToolbarPosition(toolbarPosition.left, toolbarPosition.top);
        toolbar.style.left = `${toolbarPosition.left}px`;
        toolbar.style.top = `${toolbarPosition.top}px`;
        toolbar.style.transform = 'none';
    };

    const createToolbarGrip = (): HTMLDivElement => {
        const grip = document.createElement('div');
        grip.className = 'vn-ann-grip';
        grip.innerHTML = ACTION_ICONS.grip;
        grip.title = 'Drag to move the toolbar';
        grip.setAttribute('aria-label', 'Move toolbar');

        grip.addEventListener('pointerdown', (event) => {
            const root = editor.root;
            const toolbar = editor.toolbar;
            if (!root || !toolbar) {
                return;
            }

            event.preventDefault();
            event.stopPropagation();

            const rootRect = root.getBoundingClientRect();
            const toolbarRect = toolbar.getBoundingClientRect();
            const offsetX = event.clientX - toolbarRect.left;
            const offsetY = event.clientY - toolbarRect.top;
            grip.setPointerCapture(event.pointerId);
            grip.classList.add('vn-ann-grip--dragging');

            const handleMove = (moveEvent: PointerEvent): void => {
                toolbarPosition = clampToolbarPosition(
                    moveEvent.clientX - rootRect.left - offsetX,
                    moveEvent.clientY - rootRect.top - offsetY
                );
                applyToolbarPosition();
            };

            const handleUp = (): void => {
                grip.classList.remove('vn-ann-grip--dragging');
                grip.removeEventListener('pointermove', handleMove);
                grip.removeEventListener('pointerup', handleUp);
                grip.removeEventListener('pointercancel', handleUp);
            };

            grip.addEventListener('pointermove', handleMove);
            grip.addEventListener('pointerup', handleUp);
            grip.addEventListener('pointercancel', handleUp);
        });

        return grip;
    };

    const createToolbar = (): HTMLDivElement => {
        const toolbar = document.createElement('div');
        toolbar.id = 'video-notes-annotation-toolbar';
        toolbar.className = 'vn-ann-toolbar';
        toolbar.setAttribute('role', 'toolbar');
        toolbar.setAttribute('aria-label', 'Drawing tools');

        const createSeparator = (): HTMLSpanElement => {
            const divider = document.createElement('span');
            divider.className = 'vn-ann-sep';
            return divider;
        };

        toolbar.appendChild(createToolbarGrip());

        const rows = document.createElement('div');
        rows.className = 'vn-ann-rows';
        toolbar.appendChild(rows);

        const toolsRow = document.createElement('div');
        toolsRow.className = 'vn-ann-row';
        const toolGroup = document.createElement('div');
        toolGroup.className = 'vn-ann-group';
        TOOL_DEFINITIONS.forEach(({ tool, label, shortcut }) => {
            toolGroup.appendChild(createToolbarButton(label, tool, shortcut));
        });
        toolsRow.appendChild(toolGroup);
        rows.appendChild(toolsRow);

        const actionsRow = document.createElement('div');
        actionsRow.className = 'vn-ann-row';

        const styleGroup = document.createElement('div');
        styleGroup.className = 'vn-ann-group vn-ann-group--swatches';
        COLOR_SWATCHES.forEach((color) => {
            styleGroup.appendChild(createColorSwatch(color));
        });
        actionsRow.appendChild(styleGroup);

        actionsRow.appendChild(createSeparator());

        const strokeGroup = document.createElement('div');
        strokeGroup.className = 'vn-ann-group';
        const sizeInput = document.createElement('input');
        sizeInput.type = 'range';
        sizeInput.min = '2';
        sizeInput.max = '16';
        sizeInput.step = '1';
        sizeInput.value = editor.strokeWidth.toString();
        sizeInput.className = 'vn-ann-slider';
        sizeInput.title = 'Stroke width';
        sizeInput.setAttribute('aria-label', 'Annotation stroke size');
        sizeInput.addEventListener('input', () => {
            const nextValue = Number(sizeInput.value);
            editor.strokeWidth = Number.isFinite(nextValue) ? nextValue : DEFAULT_STROKE_WIDTH;
            updateBrush();
            updateStrokeSizeDot();
        });
        strokeGroup.appendChild(sizeInput);

        const sizeDot = document.createElement('span');
        sizeDot.className = 'vn-ann-size-dot';
        sizeDot.setAttribute('aria-hidden', 'true');
        strokeGroup.appendChild(sizeDot);
        editor.strokeSizeDot = sizeDot;
        updateStrokeSizeDot();
        actionsRow.appendChild(strokeGroup);

        actionsRow.appendChild(createSeparator());

        const historyGroup = document.createElement('div');
        historyGroup.className = 'vn-ann-group';
        const undoButton = createActionButton('Undo', ACTION_ICONS.undo, 'Undo — Ctrl/Cmd+Z', undoAnnotation);
        const redoButton = createActionButton('Redo', ACTION_ICONS.redo, 'Redo — Ctrl/Cmd+Shift+Z', redoAnnotation);
        const clearButton = createActionButton('Clear', ACTION_ICONS.clear, 'Clear all', clearAnnotation);
        historyGroup.appendChild(undoButton);
        historyGroup.appendChild(redoButton);
        historyGroup.appendChild(clearButton);
        actionsRow.appendChild(historyGroup);
        editor.undoButton = undoButton;
        editor.redoButton = redoButton;
        editor.clearButton = clearButton;

        actionsRow.appendChild(createSeparator());

        const deleteNoteButton = document.createElement('button');
        deleteNoteButton.type = 'button';
        deleteNoteButton.className = 'vn-ann-delete-note';
        deleteNoteButton.dataset.annotationDeleteNote = 'true';
        deleteNoteButton.innerHTML = `${ACTION_ICONS.delete}<span>Delete</span>`;
        deleteNoteButton.title = 'Delete this annotation note';
        deleteNoteButton.setAttribute('aria-label', 'Delete annotation note');
        deleteNoteButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            host.onDelete();
        });
        actionsRow.appendChild(deleteNoteButton);

        const doneButton = document.createElement('button');
        doneButton.type = 'button';
        doneButton.className = 'vn-ann-done';
        doneButton.innerHTML = `${ACTION_ICONS.done}<span>Done</span>`;
        doneButton.title = 'Save note — Ctrl/Cmd+Enter';
        doneButton.setAttribute('aria-label', 'Annotation Done');
        doneButton.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopPropagation();
            host.onDone();
        });
        actionsRow.appendChild(doneButton);

        rows.appendChild(actionsRow);

        return toolbar;
    };

    const createCommonShapeOptions = (): Record<string, unknown> => ({
        fill: 'rgba(0, 0, 0, 0)',
        stroke: editor.color,
        strokeWidth: editor.strokeWidth,
        strokeUniform: true,
        selectable: false,
        evented: true,
        // Fabric v7 defaults origins to 'center', which would render shapes
        // offset by half their size from the pointer drag; anchor top-left.
        originX: 'left',
        originY: 'top'
    });

    const getPointerPosition = (canvas: Canvas, event: TPointerEvent): PointerPosition => {
        const pointer = canvas.getScenePoint(event);
        return {
            x: pointer.x,
            y: pointer.y
        };
    };

    const createDraftShape = (tool: DraftShape['tool'], start: PointerPosition): FabricObject => {
        if (tool === 'rect') {
            return new Rect({
                ...createCommonShapeOptions(),
                left: start.x,
                top: start.y,
                width: 1,
                height: 1
            });
        }

        if (tool === 'ellipse') {
            return new Ellipse({
                ...createCommonShapeOptions(),
                left: start.x,
                top: start.y,
                rx: 1,
                ry: 1
            });
        }

        return new Line([start.x, start.y, start.x, start.y], createCommonShapeOptions());
    };

    const updateDraftShape = (draft: DraftShape, pointer: PointerPosition): void => {
        const { start, object, tool } = draft;
        if (tool === 'rect') {
            object.set({
                left: Math.min(start.x, pointer.x),
                top: Math.min(start.y, pointer.y),
                width: Math.abs(pointer.x - start.x),
                height: Math.abs(pointer.y - start.y)
            });
            object.setCoords();
            return;
        }

        if (tool === 'ellipse') {
            object.set({
                left: Math.min(start.x, pointer.x),
                top: Math.min(start.y, pointer.y),
                rx: Math.abs(pointer.x - start.x) / 2,
                ry: Math.abs(pointer.y - start.y) / 2
            });
            object.setCoords();
            return;
        }

        object.set({
            x2: pointer.x,
            y2: pointer.y
        });
        object.setCoords();
    };

    const createArrowPath = (start: PointerPosition, end: PointerPosition): Path => {
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const headLength = Math.max(12, editor.strokeWidth * 4);
        const spread = Math.PI / 7;
        const leftHead = {
            x: end.x - headLength * Math.cos(angle - spread),
            y: end.y - headLength * Math.sin(angle - spread)
        };
        const rightHead = {
            x: end.x - headLength * Math.cos(angle + spread),
            y: end.y - headLength * Math.sin(angle + spread)
        };

        const pathData =
            `M ${start.x} ${start.y} L ${end.x} ${end.y} ` +
            `M ${end.x} ${end.y} L ${leftHead.x} ${leftHead.y} ` +
            `M ${end.x} ${end.y} L ${rightHead.x} ${rightHead.y}`;

        return new Path(pathData, createCommonShapeOptions());
    };

    const finishDraftShape = (pointer: PointerPosition): void => {
        const canvas = editor.canvas;
        const draft = editor.draftShape;
        if (!canvas || !draft) {
            return;
        }

        const deltaX = Math.abs(pointer.x - draft.start.x);
        const deltaY = Math.abs(pointer.y - draft.start.y);
        const isTooSmall = deltaX < MIN_SHAPE_SIZE && deltaY < MIN_SHAPE_SIZE;

        if (isTooSmall) {
            canvas.remove(draft.object);
            editor.draftShape = null;
            canvas.requestRenderAll();
            return;
        }

        if (draft.tool === 'arrow') {
            canvas.remove(draft.object);
            const arrow = createArrowPath(draft.start, pointer);
            canvas.add(arrow);
        } else {
            draft.object.set({ selectable: editor.activeTool === 'select' });
        }

        editor.draftShape = null;
        canvas.requestRenderAll();
        captureHistory();
    };

    const addTextAtPointer = (pointer: PointerPosition): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        const text = new Textbox('Text', {
            left: pointer.x,
            top: pointer.y,
            originX: 'left',
            originY: 'top',
            width: 220,
            fontSize: 28,
            fontFamily: 'Arial, sans-serif',
            fill: editor.color,
            backgroundColor: 'rgba(0, 0, 0, 0)',
            selectable: true
        });

        canvas.add(text);
        // Hand the user straight to select mode so the fresh textbox can be
        // moved or resized and a second click doesn't stack another box.
        setActiveTool('select');
        canvas.setActiveObject(text);
        canvas.requestRenderAll();
        text.enterEditing();
        text.selectAll();
        captureHistory();
    };

    const eraseTargetAt = (canvas: Canvas, event: TPointerEvent): void => {
        const { target } = canvas.findTarget(event);
        if (!target) {
            return;
        }

        canvas.remove(target);
        canvas.requestRenderAll();
        editor.eraserRemovedObject = true;
    };

    const attachCanvasListeners = (canvas: Canvas): void => {
        canvas.on('mouse:down', (event) => {
            if (editor.activeTool === 'eraser') {
                editor.isPointerDown = true;
                editor.eraserRemovedObject = false;
                if (event.target) {
                    canvas.remove(event.target);
                    canvas.requestRenderAll();
                    editor.eraserRemovedObject = true;
                }
                return;
            }

            if (editor.activeTool === 'text') {
                addTextAtPointer(getPointerPosition(canvas, event.e));
                return;
            }

            if (
                editor.activeTool !== 'line' &&
                editor.activeTool !== 'arrow' &&
                editor.activeTool !== 'rect' &&
                editor.activeTool !== 'ellipse'
            ) {
                return;
            }

            editor.isPointerDown = true;
            const start = getPointerPosition(canvas, event.e);
            const object = createDraftShape(editor.activeTool, start);
            editor.draftShape = {
                tool: editor.activeTool,
                start,
                object
            };
            canvas.add(object);
        });

        canvas.on('mouse:move', (event) => {
            if (!editor.isPointerDown) {
                return;
            }

            if (editor.activeTool === 'eraser') {
                eraseTargetAt(canvas, event.e);
                return;
            }

            if (!editor.draftShape) {
                return;
            }

            updateDraftShape(editor.draftShape, getPointerPosition(canvas, event.e));
            canvas.requestRenderAll();
        });

        canvas.on('mouse:up', (event) => {
            if (!editor.isPointerDown) {
                return;
            }

            editor.isPointerDown = false;

            if (editor.activeTool === 'eraser') {
                if (editor.eraserRemovedObject) {
                    editor.eraserRemovedObject = false;
                    captureHistory();
                }
                return;
            }

            finishDraftShape(getPointerPosition(canvas, event.e));
        });

        canvas.on('object:modified', () => {
            captureHistory();
        });

        canvas.on('path:created', () => {
            captureHistory();
        });

        canvas.on('text:editing:exited', () => {
            captureHistory();
        });
    };

    const scaleCanvasObjects = (
        fromWidth: number,
        fromHeight: number,
        toWidth: number,
        toHeight: number
    ): void => {
        const canvas = editor.canvas;
        if (!canvas || fromWidth <= 0 || fromHeight <= 0 || toWidth <= 0 || toHeight <= 0) {
            return;
        }

        const scaleX = toWidth / fromWidth;
        const scaleY = toHeight / fromHeight;
        if (!Number.isFinite(scaleX) || !Number.isFinite(scaleY) || (scaleX === 1 && scaleY === 1)) {
            return;
        }

        canvas.getObjects().forEach((object) => {
            const currentLeft = Number(object.left) || 0;
            const currentTop = Number(object.top) || 0;
            const currentScaleX = Number(object.scaleX) || 1;
            const currentScaleY = Number(object.scaleY) || 1;
            object.set({
                left: currentLeft * scaleX,
                top: currentTop * scaleY,
                scaleX: currentScaleX * scaleX,
                scaleY: currentScaleY * scaleY
            });
            object.setCoords();
        });
    };

    const resize = (): void => {
        const root = editor.root;
        const canvas = editor.canvas;
        if (!root || !canvas) {
            return;
        }

        const rect = getOverlayRect();
        if (!rect) {
            return;
        }

        const width = Math.max(1, Math.round(rect.width));
        const height = Math.max(1, Math.round(rect.height));

        applyStyles(root, {
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${width}px`,
            height: `${height}px`
        });

        if (editor.viewportWidth !== width || editor.viewportHeight !== height) {
            const previousWidth = editor.viewportWidth;
            const previousHeight = editor.viewportHeight;
            canvas.setDimensions({ width, height });
            if (previousWidth > 0 && previousHeight > 0) {
                scaleCanvasObjects(previousWidth, previousHeight, width, height);
            }
            editor.viewportWidth = width;
            editor.viewportHeight = height;
            canvas.requestRenderAll();
            applyToolbarPosition();
        }
    };

    const attachResponsiveListeners = (): void => {
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', resize);
        window.addEventListener('scroll', resize, true);
        window.addEventListener('yt-navigate-finish', resize);
        window.addEventListener('yt-page-data-updated', resize);

        const target = getPlayerElement() || getVideoElement();
        if (target && typeof ResizeObserver !== 'undefined') {
            editor.resizeObserver = new ResizeObserver(() => {
                resize();
            });
            editor.resizeObserver.observe(target);
        }
    };

    const detachResponsiveListeners = (): void => {
        window.removeEventListener('resize', resize);
        window.removeEventListener('orientationchange', resize);
        window.removeEventListener('scroll', resize, true);
        window.removeEventListener('yt-navigate-finish', resize);
        window.removeEventListener('yt-page-data-updated', resize);
        if (editor.resizeObserver) {
            editor.resizeObserver.disconnect();
            editor.resizeObserver = null;
        }
    };

    const handleEditorKeydown = (event: KeyboardEvent): void => {
        if (!editor.root || !editor.root.isConnected) {
            return;
        }

        if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            event.stopPropagation();
            host.onDone();
            return;
        }

        // Text fields keep their own Escape handling: the dialog textarea
        // closes the dialog via its keydown handler, and Fabric's hidden
        // textarea exits canvas text editing.
        if (isEditableTarget(event.target)) {
            return;
        }

        if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            host.onCancel();
            return;
        }

        const key = typeof event.key === 'string' ? event.key.toLowerCase() : '';
        const hasModifier = event.ctrlKey || event.metaKey;

        if (hasModifier && key === 'z') {
            event.preventDefault();
            event.stopPropagation();
            if (event.shiftKey) {
                redoAnnotation();
            } else {
                undoAnnotation();
            }
            return;
        }

        if (hasModifier && key === 'y') {
            event.preventDefault();
            event.stopPropagation();
            redoAnnotation();
            return;
        }

        if (!hasModifier && !event.altKey) {
            const tool = TOOL_SHORTCUTS[key];
            if (tool) {
                event.preventDefault();
                event.stopPropagation();
                setActiveTool(tool);
                return;
            }
        }

        if (event.key === 'Delete' || event.key === 'Backspace') {
            event.preventDefault();
            event.stopPropagation();
            removeSelectedObjects();
        }
    };

    const pauseVideoForEditing = (): void => {
        const video = host.state.video || getVideoElement();
        if (!video || video.paused || video.ended) {
            return;
        }

        if (!host.state.resumePlaybackVideo) {
            host.state.resumePlaybackVideo = video;
        }

        try {
            video.pause();
        } catch {
            // Ignore pause errors from detached players.
        }
    };

    const createEditorShell = (): boolean => {
        const rect = getOverlayRect();
        if (!rect || !document.body) {
            return false;
        }

        ensureAnnotationStyles();

        const root = document.createElement('div');
        root.id = ANNOTATION_ROOT_ID;
        root.setAttribute('aria-label', 'Video note annotation editor');
        applyStyles(root, {
            position: 'fixed',
            top: `${rect.top}px`,
            left: `${rect.left}px`,
            width: `${Math.max(1, Math.round(rect.width))}px`,
            height: `${Math.max(1, Math.round(rect.height))}px`,
            zIndex: '4998',
            pointerEvents: 'none'
        });

        const canvasElement = document.createElement('canvas');
        canvasElement.id = 'video-notes-annotation-canvas';
        root.appendChild(canvasElement);

        const ring = document.createElement('div');
        ring.className = 'vn-ann-ring';
        root.appendChild(ring);

        const toolbar = createToolbar();
        root.appendChild(toolbar);

        const hint = document.createElement('div');
        hint.className = 'vn-ann-hint';
        hint.textContent = 'Done or Ctrl/⌘↵ to save · Esc to cancel';
        root.appendChild(hint);

        document.body.appendChild(root);

        const canvas = new Canvas(canvasElement, {
            backgroundColor: 'rgba(0, 0, 0, 0)',
            preserveObjectStacking: true,
            selection: true
        });
        canvas.wrapperEl.style.pointerEvents = 'auto';
        canvas.wrapperEl.style.position = 'absolute';
        canvas.wrapperEl.style.inset = '0';
        canvas.upperCanvasEl.style.touchAction = 'none';
        canvas.freeDrawingBrush = new PencilBrush(canvas);

        editor.root = root;
        editor.toolbar = toolbar;
        editor.canvasElement = canvasElement;
        editor.canvas = canvas;
        editor.viewportWidth = 0;
        editor.viewportHeight = 0;

        attachCanvasListeners(canvas);
        attachResponsiveListeners();
        window.addEventListener('keydown', handleEditorKeydown, true);
        resize();
        applyToolbarPosition();
        setActiveTool('pen');
        resetHistory();
        return true;
    };

    const loadAnnotation = (annotation: NoteAnnotation): void => {
        const canvas = editor.canvas;
        if (!canvas) {
            return;
        }

        // Until the scene finishes loading, saves must see the original
        // annotation instead of the momentarily-empty canvas.
        pendingLoadAnnotation = annotation;
        editor.isRestoringHistory = true;
        canvas.loadFromJSON(annotation.scene)
            .then(() => {
                scaleCanvasObjects(
                    annotation.viewport.width,
                    annotation.viewport.height,
                    editor.viewportWidth,
                    editor.viewportHeight
                );
                setObjectsSelectable(editor.activeTool === 'select');
                canvas.requestRenderAll();
                editor.isRestoringHistory = false;
                pendingLoadAnnotation = null;
                resetHistory();
            })
            .catch(() => {
                editor.isRestoringHistory = false;
                pendingLoadAnnotation = null;
                canvas.clear();
                resetHistory();
            });
    };

    const close = (): void => {
        detachResponsiveListeners();
        window.removeEventListener('keydown', handleEditorKeydown, true);

        if (editor.canvas) {
            editor.canvas.dispose();
        }

        if (editor.root && editor.root.parentElement) {
            editor.root.remove();
        }

        editor.root = null;
        editor.toolbar = null;
        editor.canvasElement = null;
        editor.canvas = null;
        editor.undoButton = null;
        editor.redoButton = null;
        editor.clearButton = null;
        editor.strokeSizeDot = null;
        editor.draftShape = null;
        editor.history = [];
        editor.historyIndex = -1;
        editor.isRestoringHistory = false;
        editor.isPointerDown = false;
        editor.eraserRemovedObject = false;
        editor.viewportWidth = 0;
        editor.viewportHeight = 0;
        pendingLoadAnnotation = null;
    };

    const isActive = (): boolean => Boolean(editor.root && editor.root.isConnected && editor.canvas);

    const isTarget = (target: EventTarget | null): boolean =>
        Boolean(target instanceof Node && editor.root && editor.root.contains(target));

    const hasContent = (): boolean => {
        if (!isActive()) {
            return false;
        }

        if (pendingLoadAnnotation) {
            return true;
        }

        return Boolean(editor.canvas && editor.canvas.getObjects().length > 0);
    };

    const getCurrentAnnotation = (): NoteAnnotation | null | undefined => {
        const canvas = editor.canvas;
        if (!isActive() || !canvas) {
            return undefined;
        }

        if (pendingLoadAnnotation) {
            return pendingLoadAnnotation;
        }

        canvas.discardActiveObject();
        canvas.requestRenderAll();

        if (canvas.isEmpty()) {
            return null;
        }

        const width = Math.max(1, Math.round(editor.viewportWidth));
        const height = Math.max(1, Math.round(editor.viewportHeight));
        const scene = canvas.toJSON() as unknown as Record<string, unknown>;
        const dataUrl = canvas.toDataURL({
            format: 'png',
            multiplier: 1,
            enableRetinaScaling: false
        });

        return {
            version: 1,
            scene,
            image: {
                dataUrl,
                width,
                height,
                generatedAt: Date.now()
            },
            viewport: {
                width,
                height
            }
        };
    };

    const showError = (message: string): void => {
        const root = editor.root;
        if (!root) {
            return;
        }

        let error = root.querySelector<HTMLDivElement>('.vn-ann-error');
        if (!error) {
            error = document.createElement('div');
            error.className = 'vn-ann-error';
            error.setAttribute('role', 'alert');
            root.appendChild(error);
        }
        error.textContent = message;
    };

    const open = (annotation: NoteAnnotation | null): boolean => {
        close();

        try {
            if (!createEditorShell()) {
                return false;
            }

            const deleteNoteButton = editor.toolbar?.querySelector<HTMLButtonElement>(
                '[data-annotation-delete-note]'
            );
            if (deleteNoteButton) {
                deleteNoteButton.style.display = annotation ? 'inline-flex' : 'none';
            }

            if (annotation) {
                loadAnnotation(annotation);
            }

            pauseVideoForEditing();
            return true;
        } catch {
            close();
            return false;
        }
    };

    return {
        open,
        close,
        isActive,
        isTarget,
        resize,
        hasContent,
        getCurrentAnnotation,
        showError
    };
};

export { createAnnotationEditor };
