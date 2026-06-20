interface MockYoutubeOptions {
    title: string;
    durationSeconds?: number;
    currentTimeSeconds?: number;
}

const escapeHtml = (value: string): string =>
    value
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');

const createMockYoutubeWatchPage = ({
    title,
    durationSeconds = 600,
    currentTimeSeconds = 0
}: MockYoutubeOptions): string => {
    const safeTitle = escapeHtml(title);

    return `<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <title>${safeTitle} - YouTube</title>
    <style>
        body {
            margin: 0;
            background: #0f0f0f;
            color: #f1f1f1;
            font-family: Arial, sans-serif;
        }

        ytd-watch-flexy,
        ytd-watch-metadata {
            display: block;
        }

        #player {
            width: 960px;
            height: 360px;
            margin: 24px auto 0;
            background: #000;
        }

        video.html5-main-video {
            width: 100%;
            height: 100%;
            display: block;
        }

        #primary-inner {
            width: 960px;
            margin: 0 auto;
        }

        #title {
            margin: 20px 0;
            font-size: 24px;
        }
    </style>
</head>
<body>
    <ytd-watch-flexy>
        <div id="player">
            <video class="html5-main-video"></video>
            <button class="ytp-size-button" type="button" hidden>Theater mode</button>
        </div>
        <div id="primary-inner">
            <ytd-watch-metadata>
                <div id="watch-metadata-title-row">
                    <h1 id="title">${safeTitle}</h1>
                </div>
            </ytd-watch-metadata>
        </div>
        <div id="secondary">Mock recommendations</div>
        <div id="comments">Mock comments</div>
    </ytd-watch-flexy>
    <script>
        (() => {
            const flexy = document.querySelector('ytd-watch-flexy');
            const sizeButton = document.querySelector('.ytp-size-button');
            if (sizeButton && flexy) {
                sizeButton.addEventListener('click', () => {
                    const isTheater = flexy.hasAttribute('theater');
                    if (isTheater) {
                        flexy.removeAttribute('theater');
                        flexy.classList.remove('theater', 'theater-mode');
                    } else {
                        flexy.setAttribute('theater', '');
                        flexy.classList.add('theater', 'theater-mode');
                    }
                });
            }

            const video = document.querySelector('video.html5-main-video');
            Object.defineProperty(video, 'duration', {
                configurable: true,
                get: () => ${durationSeconds}
            });
            Object.defineProperty(video, 'ended', {
                configurable: true,
                get: () => false
            });
            video.currentTime = ${currentTimeSeconds};
            video.pause = () => {
                window.__videoNotesPauseCalled = true;
                video.dispatchEvent(new Event('pause'));
            };
            video.play = () => {
                window.__videoNotesPlayCalled = true;
                video.dispatchEvent(new Event('play'));
                return Promise.resolve();
            };
            video.dispatchEvent(new Event('loadedmetadata'));
        })();
    </script>
</body>
</html>`;
};

export { createMockYoutubeWatchPage };
