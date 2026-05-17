(function () {
    'use strict';

    const WORKER_API = 'https://share-api.video-notes.workers.dev';
    let player = null;

    function formatTimestamp(seconds) {
        const s = Math.floor(seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = s % 60;
        const pad = function (n) { return n < 10 ? `0${n}` : `${n}`; };
        return h > 0
            ? `${h}:${pad(m)}:${pad(sec)}`
            : `${m}:${pad(sec)}`;
    }

    function getShareId() {
        const params = new URLSearchParams(window.location.search);
        return params.get('id');
    }

    function showLoading() {
        document.getElementById('app').innerHTML =
            '<div class="loading">' +
            '<div class="spinner"></div>' +
            '<p>Loading shared notes...</p>' +
            '</div>';
    }

    function showError(message) {
        document.getElementById('app').innerHTML =
            `<div class="error">` +
            `<h2>Oops!</h2>` +
            `<p>${message}</p>` +
            `<p style="margin-top:16px"><a href="https://prameshbajra.github.io/video-notes/">Learn about Video Notes</a></p>` +
            `</div>`;
    }

    function fetchShare(id, callback) {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', `${WORKER_API}/api/share/${encodeURIComponent(id)}`);
        xhr.onload = function () {
            if (xhr.status === 200) {
                try {
                    callback(null, JSON.parse(xhr.responseText));
                } catch (e) {
                    callback('Failed to parse response');
                }
            } else if (xhr.status === 404) {
                callback('This shared note has expired or does not exist.');
            } else {
                callback('Something went wrong. Please try again later.');
            }
        };
        xhr.onerror = function () {
            callback('Network error. Please check your connection and try again.');
        };
        xhr.send();
    }

    function renderPage(data) {
        const app = document.getElementById('app');

        const container = document.createElement('div');
        container.className = 'container';

        // Header
        const header = document.createElement('div');
        header.className = 'header';
        const h1 = document.createElement('h1');
        h1.textContent = data.title;
        const meta = document.createElement('p');
        meta.className = 'meta';
        meta.textContent = `${data.notes.length} note${data.notes.length !== 1 ? 's' : ''} shared`;
        header.appendChild(h1);
        header.appendChild(meta);

        // Main layout
        const main = document.createElement('div');
        main.className = 'main';

        // Video
        const videoWrapper = document.createElement('div');
        videoWrapper.className = 'video-wrapper';
        const playerDiv = document.createElement('div');
        playerDiv.id = 'yt-player';
        videoWrapper.appendChild(playerDiv);

        // Notes panel
        const notesPanel = document.createElement('div');
        notesPanel.className = 'notes-panel';

        const notesHeader = document.createElement('div');
        notesHeader.className = 'notes-header';
        const notesTitle = document.createElement('h2');
        notesTitle.textContent = 'Notes';
        const notesCount = document.createElement('span');
        notesCount.className = 'count';
        notesCount.textContent = `${data.notes.length} note${data.notes.length !== 1 ? 's' : ''}`;
        notesHeader.appendChild(notesTitle);
        notesHeader.appendChild(notesCount);

        const notesList = document.createElement('ul');
        notesList.className = 'notes-list';
        notesList.id = 'notes-list';

        const sortedNotes = data.notes.slice().sort((a, b) => {
            return a.timestamp - b.timestamp;
        });

        if (sortedNotes.length === 0) {
            const emptyState = document.createElement('div');
            emptyState.className = 'notes-empty';
            emptyState.innerHTML =
                '<div class="empty-icon">📝</div>' +
                '<p>No notes were shared for this video.</p>' +
                '<p style="color:rgba(245, 245, 247, 0.42);font-size:12px;margin-top:8px;">Notes may have been cleared before sharing.</p>';
            notesPanel.appendChild(notesHeader);
            notesPanel.appendChild(emptyState);
        } else {
            for (let i = 0; i < sortedNotes.length; i++) {
                const note = sortedNotes[i];
                const li = document.createElement('li');
                li.className = 'note-item';
                li.setAttribute('data-timestamp', String(note.timestamp));

                const tsBtn = document.createElement('button');
                tsBtn.className = 'note-timestamp';
                tsBtn.textContent = formatTimestamp(note.timestamp);
                tsBtn.setAttribute('data-timestamp', String(note.timestamp));

                const textSpan = document.createElement('span');
                textSpan.className = 'note-text';
                textSpan.textContent = note.text;

                li.appendChild(tsBtn);
                li.appendChild(textSpan);
                notesList.appendChild(li);
            }

            notesPanel.appendChild(notesHeader);
            notesPanel.appendChild(notesList);
        }

        main.appendChild(videoWrapper);
        main.appendChild(notesPanel);

        // Footer
        const footer = document.createElement('div');
        footer.className = 'footer';

        const tagline = document.createElement('p');
        tagline.className = 'footer-tagline';
        const footerLink = document.createElement('a');
        footerLink.href = 'https://prameshbajra.github.io/video-notes/';
        footerLink.textContent = 'Video Notes';
        tagline.appendChild(document.createTextNode('Taken with '));
        tagline.appendChild(footerLink);
        tagline.appendChild(document.createTextNode(' \u2014 a browser extension for timestamped YouTube notes'));
        footer.appendChild(tagline);

        const ctaButton = document.createElement('a');
        ctaButton.className = 'cta-button';
        ctaButton.href = 'https://chromewebstore.google.com/detail/video-notes/phgnkidiglnijkpmmdjcgdkekfoelcom';
        ctaButton.target = '_blank';
        ctaButton.rel = 'noopener noreferrer';
        ctaButton.textContent = '\u2B07 Install Extension';
        footer.appendChild(ctaButton);

        container.appendChild(header);
        container.appendChild(main);
        container.appendChild(footer);

        app.innerHTML = '';
        app.appendChild(container);

        // Init YouTube player
        initPlayer(data.videoId);

        // Dynamic OG image using YouTube thumbnail
        if (data.videoId) {
            var thumbUrl = 'https://img.youtube.com/vi/' + data.videoId + '/hqdefault.jpg';
            var ogImg = document.getElementById('og-image');
            var twImg = document.getElementById('twitter-image');
            if (ogImg) ogImg.setAttribute('content', thumbUrl);
            if (twImg) twImg.setAttribute('content', thumbUrl);
        }

        // Click handlers for timestamps
        notesList.addEventListener('click', (e) => {
            const target = e.target;
            const item = target.closest('.note-item');
            if (!item) return;

            const ts = parseFloat(item.getAttribute('data-timestamp'));
            if (!isNaN(ts) && player && player.seekTo) {
                player.seekTo(ts, true);
                player.playVideo();

                // Highlight active
                const items = notesList.querySelectorAll('.note-item');
                for (let j = 0; j < items.length; j++) {
                    items[j].classList.remove('active');
                    items[j].classList.remove('highlight');
                }
                item.classList.add('active');

                // Smooth scroll into view
                item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

                // Trigger highlight animation
                void item.offsetWidth; // force reflow
                item.classList.add('highlight');
                item.addEventListener('animationend', function onEnd() {
                    item.removeEventListener('animationend', onEnd);
                    item.classList.remove('highlight');
                }, { once: true });
            }
        });
    }

    function initPlayer(videoId) {
        if (window.YT && window.YT.Player) {
            createPlayer(videoId);
        } else {
            window.onYouTubeIframeAPIReady = function () {
                createPlayer(videoId);
            };
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
        }
    }

    function createPlayer(videoId) {
        player = new window.YT.Player('yt-player', {
            videoId: videoId,
            playerVars: {
                autoplay: 0,
                modestbranding: 1,
                rel: 0
            }
        });
    }

    // Main
    document.addEventListener('DOMContentLoaded', () => {
        const id = getShareId();
        if (!id) {
            showError('Invalid share link. No share ID found in the URL.');
            return;
        }

        showLoading();
        fetchShare(id, (err, data) => {
            if (err) {
                showError(err);
                return;
            }
            renderPage(data);
        });
    });
})();
