import { expect, test } from '@playwright/test';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const PNG_DATA_URL =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const getSharePageUrl = (): string => {
    const fileUrl = pathToFileURL(path.resolve(process.cwd(), 'share', 'index.html')).toString();
    return `${fileUrl}?id=annotated-share`;
};

test('static share page shows annotation overlay for selected annotated notes', async ({ page }) => {
    await page.route('https://share-api.video-notes.workers.dev/api/share/annotated-share', async (route) => {
        await route.fulfill({
            status: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                videoId: 'abcDEF12345',
                title: 'Shared Annotation Video',
                notes: [
                    {
                        timestamp: 12,
                        text: 'Annotated shared note',
                        annotation: {
                            version: 1,
                            image: {
                                dataUrl: PNG_DATA_URL,
                                width: 1,
                                height: 1,
                                generatedAt: 1
                            },
                            viewport: {
                                width: 960,
                                height: 360
                            }
                        }
                    },
                    {
                        timestamp: 24,
                        text: 'Plain shared note'
                    }
                ]
            })
        });
    });

    await page.route('https://www.youtube.com/iframe_api', async (route) => {
        await route.fulfill({
            status: 200,
            contentType: 'application/javascript',
            body: `
                window.YT = {
                    Player: function Player(id, options) {
                        const container = document.getElementById(id);
                        if (container) {
                            const iframe = document.createElement('iframe');
                            iframe.title = 'Mock YouTube player';
                            container.appendChild(iframe);
                        }
                        window.__playerOptions = options;
                        window.__playerActions = [];
                        window.__isVideoPlaying = true;
                        window.__playerState = 1;
                        return {
                            seekTo: function seekTo(seconds) {
                                window.__lastSeekTo = seconds;
                                window.__playerActions.push('seek:' + seconds);
                                window.__isVideoPlaying = true;
                                window.__playerState = 1;
                            },
                            pauseVideo: function pauseVideo() {
                                window.__pauseVideoCalled = true;
                                window.__playerActions.push('pause');
                                window.__isVideoPlaying = false;
                                window.__playerState = 2;
                            },
                            playVideo: function playVideo() {
                                window.__playVideoCalled = true;
                                window.__playerActions.push('play');
                                window.__isVideoPlaying = true;
                                window.__playerState = 1;
                            },
                            getCurrentTime: function getCurrentTime() {
                                return window.__lastSeekTo || 0;
                            },
                            getPlayerState: function getPlayerState() {
                                return window.__playerState;
                            }
                        };
                    },
                    PlayerState: { PLAYING: 1, PAUSED: 2, BUFFERING: 3 }
                };
                if (typeof window.onYouTubeIframeAPIReady === 'function') {
                    window.onYouTubeIframeAPIReady();
                }
            `
        });
    });

    await page.goto(getSharePageUrl(), { waitUntil: 'domcontentloaded' });
    await expect(page.getByRole('heading', { name: 'Shared Annotation Video' })).toBeVisible();

    const badge = page.locator('.note-annotation-badge');
    await expect(badge).toHaveCount(1);
    await expect(badge).toHaveText('Drawing');

    await page.getByText('Annotated shared note').click();
    const overlay = page.locator('.annotation-overlay');
    await expect(overlay).toBeVisible();
    await expect(overlay).toHaveAttribute('src', PNG_DATA_URL);
    const overlayBox = await overlay.boundingBox();
    const wrapperBox = await page.locator('.video-wrapper').boundingBox();
    expect(overlayBox).not.toBeNull();
    expect(wrapperBox).not.toBeNull();
    if (overlayBox && wrapperBox) {
        expect(overlayBox.width / overlayBox.height).toBeCloseTo(960 / 360, 2);
        expect(overlayBox.x + overlayBox.width / 2).toBeCloseTo(wrapperBox.x + wrapperBox.width / 2, 1);
        expect(overlayBox.y + overlayBox.height / 2).toBeCloseTo(wrapperBox.y + wrapperBox.height / 2, 1);
    }
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __lastSeekTo?: number }).__lastSeekTo || null
    )).toBe(12);
    await expect.poll(async () => page.evaluate(() =>
        Boolean((window as unknown as { __pauseVideoCalled?: boolean }).__pauseVideoCalled)
    )).toBe(true);
    await expect.poll(async () => page.evaluate(() =>
        Boolean((window as unknown as { __playVideoCalled?: boolean }).__playVideoCalled)
    )).toBe(false);
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __playerActions?: string[] }).__playerActions || []
    )).toEqual(['seek:12', 'pause']);
    await expect.poll(async () => page.evaluate(() =>
        Boolean((window as unknown as { __isVideoPlaying?: boolean }).__isVideoPlaying)
    )).toBe(false);

    await page.evaluate(() => {
        const globalState = window as unknown as {
            __playerState: number;
            __playerOptions?: { events?: { onStateChange?: (event: { data: number }) => void } };
        };
        globalState.__playerState = 1;
        globalState.__playerOptions?.events?.onStateChange?.({ data: 1 });
    });
    await expect(overlay).toBeVisible();
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __playerActions?: string[] }).__playerActions || []
    )).toEqual(['seek:12', 'pause', 'pause']);
    await expect.poll(async () => page.evaluate(() =>
        Boolean((window as unknown as { __isVideoPlaying?: boolean }).__isVideoPlaying)
    )).toBe(false);

    await page.evaluate(() => {
        const globalState = window as unknown as {
            __playerState: number;
            __playerOptions?: { events?: { onStateChange?: (event: { data: number }) => void } };
        };
        globalState.__playerState = 2;
        globalState.__playerOptions?.events?.onStateChange?.({ data: 2 });
    });
    await page.evaluate(() => {
        const globalState = window as unknown as {
            __playerState: number;
            __playerOptions?: { events?: { onStateChange?: (event: { data: number }) => void } };
        };
        globalState.__playerState = 1;
        globalState.__playerOptions?.events?.onStateChange?.({ data: 1 });
    });
    await expect(overlay).toBeHidden();

    await page.getByText('Annotated shared note').click();
    await expect(overlay).toBeVisible();

    await page.evaluate(() => {
        (window as unknown as { __playerActions: string[] }).__playerActions = [];
    });
    await page.getByText('Plain shared note').click();
    await expect(overlay).toBeHidden();
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __lastSeekTo?: number }).__lastSeekTo || null
    )).toBe(24);
    await expect.poll(async () => page.evaluate(() =>
        Boolean((window as unknown as { __playVideoCalled?: boolean }).__playVideoCalled)
    )).toBe(true);
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __playerActions?: string[] }).__playerActions || []
    )).toEqual(['seek:24', 'play']);
});
