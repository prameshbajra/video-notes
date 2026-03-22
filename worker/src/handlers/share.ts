import { generateShareId } from '../utils/id.js';
import { validatePayload } from '../utils/validation.js';

interface Env {
    SHARES: KVNamespace;
}

const SHARE_TTL_SECONDS = 90 * 24 * 60 * 60; // 90 days
const RATE_LIMIT_WINDOW = 60; // 1 minute
const RATE_LIMIT_MAX = 10; // max creates per window
const VIEWER_BASE_URL = 'https://static-video-notes.pages.dev/';

const checkRateLimit = async (ip: string, kv: KVNamespace): Promise<boolean> => {
    const key = `ratelimit:${ip}`;
    const current = await kv.get(key);
    const count = current ? parseInt(current, 10) : 0;

    if (count >= RATE_LIMIT_MAX) {
        return false;
    }

    await kv.put(key, String(count + 1), { expirationTtl: RATE_LIMIT_WINDOW });
    return true;
};

export const handleCreateShare = async (request: Request, env: Env): Promise<Response> => {
    const ip = request.headers.get('cf-connecting-ip') || 'unknown';

    const allowed = await checkRateLimit(ip, env.SHARES);
    if (!allowed) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded. Try again in a minute.' }), {
            status: 429,
            headers: { 'Content-Type': 'application/json', 'Retry-After': '60' }
        });
    }

    const rawText = await request.text();

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
