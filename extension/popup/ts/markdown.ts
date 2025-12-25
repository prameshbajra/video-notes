const generateMarkdownFromVideo = (video: VideoListItem, template: string): string => {
    const youtubeUrl = `https://www.youtube.com/watch?v=${video.videoId}`;
    const lines = template.split('\n');
    const resultLines: string[] = [];
    let notePatternLines: string[] = [];

    for (const line of lines) {
        const hasNotePlaceholders = /\*time\*/.test(line) || /\*time-url\*/.test(line) || /\*note\*/.test(line);

        if (hasNotePlaceholders) {
            notePatternLines.push(line);
        } else {
            if (notePatternLines.length > 0) {
                video.notes.forEach((note) => {
                    notePatternLines.forEach((patternLine) => {
                        let processedLine = patternLine;
                        const noteYoutubeUrl = `${youtubeUrl}&t=${Math.floor(note.timestamp)}s`;
                        const timeLink = `[${note.formattedTimestamp}](${noteYoutubeUrl})`;
                        processedLine = processedLine.replace(/\*video-title\*/g, () => video.title);
                        processedLine = processedLine.replace(/\*youtube-url\*/g, () => youtubeUrl);
                        processedLine = processedLine.replace(/\*time-url\*/g, () => timeLink);
                        processedLine = processedLine.replace(/\*time\*/g, () => note.formattedTimestamp);
                        processedLine = processedLine.replace(/\*note\*/g, () => note.text);
                        resultLines.push(processedLine);
                    });
                });
                notePatternLines = [];
            }

            let processedLine = line;
            processedLine = processedLine.replace(/\*video-title\*/g, () => video.title);
            processedLine = processedLine.replace(/\*youtube-url\*/g, () => youtubeUrl);
            processedLine = processedLine.replace(/\*time-url\*/g, () => '');
            processedLine = processedLine.replace(/\*time\*/g, () => '');
            processedLine = processedLine.replace(/\*note\*/g, () => '');
            resultLines.push(processedLine);
        }
    }

    if (notePatternLines.length > 0) {
        video.notes.forEach((note) => {
            notePatternLines.forEach((patternLine) => {
                let processedLine = patternLine;
                const noteYoutubeUrl = `${youtubeUrl}&t=${Math.floor(note.timestamp)}s`;
                const timeLink = `[${note.formattedTimestamp}](${noteYoutubeUrl})`;
                processedLine = processedLine.replace(/\*video-title\*/g, () => video.title);
                processedLine = processedLine.replace(/\*youtube-url\*/g, () => youtubeUrl);
                processedLine = processedLine.replace(/\*time-url\*/g, () => timeLink);
                processedLine = processedLine.replace(/\*time\*/g, () => note.formattedTimestamp);
                processedLine = processedLine.replace(/\*note\*/g, () => note.text);
                resultLines.push(processedLine);
            });
        });
    }

    return resultLines.join('\n');
};

export { generateMarkdownFromVideo };
