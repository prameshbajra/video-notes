const isPlainObject = (value: unknown): value is Record<string, unknown> =>
    Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const getObjectOrEmpty = <T extends Record<string, unknown>>(value: unknown): T =>
    (isPlainObject(value) ? (value as T) : ({} as T));

const getNoteDedupKey = (note: StoredNote): string | null => {
    if (!isPlainObject(note)) {
        return null;
    }

    if (typeof note.id === 'string') {
        const trimmed = note.id.trim();
        if (trimmed) {
            return `id:${trimmed}`;
        }
    }

    const timestamp = Number(note.timestamp);
    const normalizedTimestamp = Number.isFinite(timestamp) ? timestamp : null;
    const text = typeof note.text === 'string' ? note.text.trim().toLowerCase() : '';

    if (normalizedTimestamp === null && !text) {
        return null;
    }

    return `fallback:${normalizedTimestamp !== null ? normalizedTimestamp : 'na'}:${text}`;
};

const mergeNotesPayload = (existingNotes: NotesIndex, importedNotes: NotesIndex): NotesIndex => {
    const merged: NotesIndex = { ...existingNotes };

    Object.entries(importedNotes).forEach(([videoId, rawNotes]) => {
        if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
            return;
        }

        const sanitizedNotes = rawNotes.filter((note): note is StoredNote => isPlainObject(note));
        if (sanitizedNotes.length === 0) {
            return;
        }

        const currentNotes = Array.isArray(merged[videoId]) ? merged[videoId] : [];
        const combined = currentNotes.slice();
        const seenKeys = new Set(currentNotes.map((note) => getNoteDedupKey(note)).filter(Boolean));

        sanitizedNotes.forEach((note) => {
            const key = getNoteDedupKey(note);
            if (!key || seenKeys.has(key)) {
                return;
            }
            seenKeys.add(key);
            combined.push(note);
        });

        merged[videoId] = combined;
    });

    return merged;
};

const mergeMetadataPayload = (
    existingMetadata: MetadataIndex,
    importedMetadata: MetadataIndex,
    mergedNotes: NotesIndex
): MetadataIndex => {
    const merged: MetadataIndex = {};

    Object.entries(existingMetadata).forEach(([videoId, metadata]) => {
        if (isPlainObject(metadata)) {
            merged[videoId] = { ...metadata };
        }
    });

    Object.entries(importedMetadata).forEach(([videoId, metadata]) => {
        if (!isPlainObject(metadata)) {
            return;
        }

        if (!merged[videoId]) {
            merged[videoId] = { ...metadata };
            return;
        }

        const currentUpdatedAt = Number(merged[videoId].updatedAt);
        const candidateUpdatedAt = Number(metadata.updatedAt);
        const useImported =
            Number.isFinite(candidateUpdatedAt) &&
            (!Number.isFinite(currentUpdatedAt) || candidateUpdatedAt > currentUpdatedAt);

        if (useImported) {
            merged[videoId] = { ...merged[videoId], ...metadata };
        }
    });

    Object.entries(mergedNotes).forEach(([videoId, notes]) => {
        if (!Array.isArray(notes) || notes.length === 0) {
            return;
        }

        const base = merged[videoId] ? { ...merged[videoId] } : {};
        base.noteCount = notes.length;
        merged[videoId] = base;
    });

    return merged;
};

const formatTimestamp = (value: number): string => {
    if (!Number.isFinite(value)) {
        return '00:00';
    }

    const totalSeconds = Math.max(0, Math.floor(value));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const minutePart = minutes.toString().padStart(2, '0');
    const secondPart = seconds.toString().padStart(2, '0');

    if (hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutePart}:${secondPart}`;
    }

    return `${minutePart}:${secondPart}`;
};

const normalizeNotes = (videoId: string, notes: StoredNote[]): NormalizedNote[] =>
    notes
        .map((note, index): NormalizedNote | null => {
            if (!note || typeof note !== 'object') {
                return null;
            }

            const timestamp = Number(note.timestamp);
            if (!Number.isFinite(timestamp)) {
                return null;
            }

            const dedupKey = getNoteDedupKey(note);
            if (!dedupKey) {
                return null;
            }

            const rawText = typeof note.text === 'string' ? note.text : '';
            const trimmedText = rawText.trim();
            const displayText = trimmedText || '(No text)';

            const updatedAtCandidate = Number(note.updatedAt);
            const createdAtCandidate = Number(note.createdAt);
            const updatedAt = Number.isFinite(updatedAtCandidate)
                ? updatedAtCandidate
                : Number.isFinite(createdAtCandidate)
                    ? createdAtCandidate
                    : 0;

            return {
                id:
                    typeof note.id === 'string' && note.id.trim()
                        ? note.id
                        : `${videoId}-${index}-${timestamp}`,
                text: displayText,
                textLower: trimmedText.toLowerCase(),
                timestamp,
                formattedTimestamp: formatTimestamp(timestamp),
                updatedAt,
                dedupKey
            };
        })
        .filter((value): value is NormalizedNote => Boolean(value))
        .sort((a, b) => a.timestamp - b.timestamp);

const transformStoragePayload = (notesPayload: NotesIndex, metadataPayload: MetadataIndex): VideoListItem[] => {
    if (!notesPayload || typeof notesPayload !== 'object') {
        return [];
    }

    const videos: VideoListItem[] = [];

    Object.entries(notesPayload).forEach(([videoId, rawNotes]) => {
        if (!Array.isArray(rawNotes) || rawNotes.length === 0) {
            return;
        }

        const sanitizedNotes = rawNotes.filter((note): note is StoredNote => isPlainObject(note));
        const normalizedNotes = normalizeNotes(videoId, sanitizedNotes);
        if (normalizedNotes.length === 0) {
            return;
        }

        const metadata =
            metadataPayload && typeof metadataPayload === 'object' ? metadataPayload[videoId] : undefined;

        const rawTitle = metadata && typeof metadata.title === 'string' ? metadata.title.trim() : '';
        const title = rawTitle || videoId;

        const updatedAtValues = [];
        if (metadata && Number.isFinite(Number(metadata.updatedAt))) {
            updatedAtValues.push(Number(metadata.updatedAt));
        }

        normalizedNotes.forEach((note) => {
            if (Number.isFinite(note.updatedAt) && note.updatedAt > 0) {
                updatedAtValues.push(note.updatedAt);
            }
        });

        const updatedAt = updatedAtValues.length > 0 ? Math.max(...updatedAtValues) : 0;

        videos.push({
            videoId,
            title,
            titleLower: title.toLowerCase(),
            noteCount: normalizedNotes.length,
            updatedAt,
            notes: normalizedNotes
        });
    });

    videos.sort((a, b) => {
        if (b.updatedAt !== a.updatedAt) {
            return b.updatedAt - a.updatedAt;
        }
        return a.title.localeCompare(b.title);
    });

    return videos;
};

export {
    formatTimestamp,
    getNoteDedupKey,
    getObjectOrEmpty,
    isPlainObject,
    mergeMetadataPayload,
    mergeNotesPayload,
    normalizeNotes,
    transformStoragePayload
};
