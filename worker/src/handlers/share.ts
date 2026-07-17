import { generateShareId } from '../utils/id.js';
import { readBoundedRequestText, validatePayload } from '../utils/validation.js';

const SHARE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const VIEWER_BASE_URL = 'https://static-video-notes.pages.dev/';

export const handleCreateShare = async (request: Request, env: Env): Promise<Response> => {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

    const rateLimit = await env.SHARE_RATE_LIMITER.limit({ key: ip });
    if (!rateLimit.success) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
        });
    }

    let rawText: string;
    try {
        rawText = await readBoundedRequestText(request);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Unable to read payload';
        const status = message === 'Payload too large' ? 413 : 400;
        return new Response(JSON.stringify({ error: message }), {
            status,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    let body: unknown;
    try {
        body = JSON.parse(rawText);
    } catch {
        return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    let payload;
    try {
        payload = validatePayload(body, new TextEncoder().encode(rawText).length);
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Validation failed';
        return new Response(JSON.stringify({ error: message }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    const id = generateShareId();
    const stored = {
        videoId: payload.videoId,
        title: payload.title,
        notes: payload.notes,
        createdAt: new Date().toISOString()
    };

    await env.SHARES.put(`share:${id}`, JSON.stringify(stored), {
        expirationTtl: SHARE_TTL_SECONDS
    });

    const url = `${VIEWER_BASE_URL}?id=${id}`;

    return new Response(JSON.stringify({ id, url }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' }
    });
};

export const handleGetShare = async (id: string, env: Env): Promise<Response> => {
    const data = await env.SHARES.get(`share:${id}`);

    if (!data) {
        return new Response(JSON.stringify({ error: 'Share not found or expired' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
        });
    }

    return new Response(data, {
        status: 200,
        headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
        }
    });
};
