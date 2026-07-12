import { getThemePalette } from './theme.js';
import { state, ui } from './state.js';

// Slim facade over the drawing editor. The Fabric.js-based editor lives in
// annotation-editor.ts and is loaded on demand via dynamic import, so YouTube
// pages don't pay for the drawing engine unless the note editor opens.

interface AnnotationEditorModule {
    createAnnotationEditor: (host: AnnotationEditorHost) => AnnotationEditorApi;
}

let editorApi: AnnotationEditorApi | null = null;
let editorModulePromise: Promise<AnnotationEditorModule | null> | null = null;
let isOpeningEditor = false;
let onDoneCallback: (() => void) | null = null;
let onCancelCallback: (() => void) | null = null;
let onDeleteCallback: (() => void) | null = null;
// Bumped whenever the editor closes so an open that is still awaiting the
// module load can detect it became stale and abort.
let sessionGeneration = 0;

const loadEditorModule = (): Promise<AnnotationEditorModule | null> => {
    if (!editorModulePromise) {
        editorModulePromise = import(chrome.runtime.getURL('scripts/annotation-editor.js'))
            .then((module) => module as AnnotationEditorModule)
            .catch(() => {
                // Allow a retry on the next attempt instead of caching failure.
                editorModulePromise = null;
                return null;
            });
    }

    return editorModulePromise;
};

const openAnnotationEditor = async (annotation: NoteAnnotation | null): Promise<boolean> => {
    closeAnnotationEditor();

    if (isOpeningEditor) {
        return false;
    }

    const generation = sessionGeneration;
    isOpeningEditor = true;
    try {
        const module = await loadEditorModule();
        const isStale = generation !== sessionGeneration;
        if (!module || isStale) {
            return false;
        }

        if (!editorApi) {
            editorApi = module.createAnnotationEditor({
                state,
                ui,
                getPalette: getThemePalette,
                onDone: () => onDoneCallback?.(),
                onCancel: () => onCancelCallback?.(),
                onDelete: () => onDeleteCallback?.()
            });
        }

        return editorApi.open(annotation);
    } catch {
        return false;
    } finally {
        isOpeningEditor = false;
    }
};

const closeAnnotationEditor = (): void => {
    sessionGeneration += 1;
    editorApi?.close();
};

const isAnnotationEditorActive = (): boolean => Boolean(editorApi?.isActive());

const isAnnotationEditorTarget = (target: EventTarget | null): boolean =>
    Boolean(editorApi?.isTarget(target));

const hasAnnotationContent = (): boolean => Boolean(editorApi?.hasContent());

const resizeCanvasToOverlay = (): void => {
    editorApi?.resize();
};

const getPendingAnnotation = (): NoteAnnotation | null | undefined => {
    if (editorApi && editorApi.isActive()) {
        return editorApi.getCurrentAnnotation();
    }

    return undefined;
};

const configureAnnotationEditor = (callbacks: {
    onDone: () => void;
    onCancel: () => void;
    onDelete: () => void;
}): void => {
    onDoneCallback = callbacks.onDone;
    onCancelCallback = callbacks.onCancel;
    onDeleteCallback = callbacks.onDelete;
};

const showAnnotationError = (message: string): void => {
    editorApi?.showError(message);
};

export {
    closeAnnotationEditor,
    configureAnnotationEditor,
    getPendingAnnotation,
    hasAnnotationContent,
    isAnnotationEditorActive,
    isAnnotationEditorTarget,
    openAnnotationEditor,
    resizeCanvasToOverlay,
    showAnnotationError
};
