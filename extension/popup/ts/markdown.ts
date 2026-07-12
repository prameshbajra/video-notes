const generateMarkdownFromVideo = (video: VideoListItem, template: string): string => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    const lines = template.split('\n');
    const resultLines: string[] = [];
    let notePatternLines: string[] = [];

    const processLine = (line: string, note?: NormalizedNote): string => {
        let processedLine = line;
        processedLine = processedLine.replace(/\*video-title\*/g, () => video.title);
        processedLine = processedLine.replace(/\*youtube-url\*/g, () => youtubeUrl);

        if (!note) {
            processedLine = processedLine.replace(/\*time-url\*/g, () => '');
            processedLine = processedLine.replace(/\*time\*/g, () => '');
            processedLine = processedLine.replace(/\*note\*/g, () => '');
            processedLine = processedLine.replace(/\*annotation-image\*/g, () => '');
            return processedLine;
        }

        const noteYoutubeUrl = `${youtubeUrl}&t=${Math.floor(note.timestamp)}s`;
        const timeLink = `[${note.formattedTimestamp}](${noteYoutubeUrl})`;
        const annotationImage = note.annotation?.image.dataUrl
            ? `![annotation](${note.annotation.image.dataUrl})`
            : '';

        processedLine = processedLine.replace(/\*time-url\*/g, () => timeLink);
        processedLine = processedLine.replace(/\*time\*/g, () => note.formattedTimestamp);
        processedLine = processedLine.replace(/\*note\*/g, () => note.text);
        processedLine = processedLine.replace(/\*annotation-image\*/g, () => annotationImage);
        return processedLine;
    };

    const flushNotePatternLines = (): void => {
        if (notePatternLines.length === 0) {
            return;
        }

        video.notes.forEach((note) => {
            notePatternLines.forEach((patternLine) => {
                const processedLine = processLine(patternLine, note);
                if (patternLine.includes('*annotation-image*') && processedLine.trim() === '') {
                    return;
                }
                resultLines.push(processedLine);
            });
        });
        notePatternLines = [];
    };

    for (const line of lines) {
        const hasNotePlaceholders =
            /\*time\*/.test(line) ||
            /\*time-url\*/.test(line) ||
            /\*note\*/.test(line) ||
            /\*annotation-image\*/.test(line);

        if (hasNotePlaceholders) {
            notePatternLines.push(line);
        } else {
            flushNotePatternLines();

            resultLines.push(processLine(line));
        }
    }

    flushNotePatternLines();

    return resultLines.join('\n');
};

export { generateMarkdownFromVideo };
