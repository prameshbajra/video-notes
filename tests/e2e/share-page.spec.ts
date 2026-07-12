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
                        return {
                            seekTo: function seekTo(seconds) {
                                window.__lastSeekTo = seconds;
                            },
                            pauseVideo: function pauseVideo() {
                                window.__pauseVideoCalled = true;
                            },
                            getCurrentTime: function getCurrentTime() {
                                return window.__lastSeekTo || 0;
                            }
                        };
                    },
                    PlayerState: { PLAYING: 1 }
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

    await page.evaluate(() => {
        const globalState = window as unknown as {
            __playerOptions?: { events?: { onStateChange?: (event: { data: number }) => void } };
        };
        globalState.__playerOptions?.events?.onStateChange?.({ data: 1 });
    });
    await expect(overlay).toBeHidden();

    await page.getByText('Annotated shared note').click();
    await expect(overlay).toBeVisible();

    await page.getByText('Plain shared note').click();
    await expect(overlay).toBeHidden();
    await expect.poll(async () => page.evaluate(() =>
        (window as unknown as { __lastSeekTo?: number }).__lastSeekTo || null
    )).toBe(24);
});
