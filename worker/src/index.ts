import { handleCreateShare, handleGetShare } from './handlers/share.js';
import { MAX_ANNOTATION_IMAGE_BYTES, MAX_PAYLOAD_BYTES } from './utils/validation.js';

const ALLOWED_ORIGINS = [
    'https://static-video-notes.pages.dev',
    'https://prameshbajra.github.io',
    'https://www.youtube.com',
    'https://youtube.com'
];

const getCorsHeaders = (request: Request): Record<string, string> => {
    const origin = request.headers.get('Origin') || '';
    const isAllowed =
        ALLOWED_ORIGINS.includes(origin) ||
        origin.endsWith('.static-video-notes.pages.dev') ||
        origin.startsWith('chrome-extension://') ||
        origin.startsWith('moz-extension://') ||
        origin.startsWith('http://localhost');

    return {
        'Access-Control-Allow-Origin': isAllowed ? origin : ALLOWED_ORIGINS[0],
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400'
    };
};

const handleOptions = (request: Request): Response => {
    return new Response(null, {
        status: 204,
        headers: getCorsHeaders(request)
    });
};

const addCorsHeaders = (response: Response, request: Request): Response => {
    const cors = getCorsHeaders(request);
    const newResponse = new Response(response.body, response);
    for (const [key, value] of Object.entries(cors)) {
        newResponse.headers.set(key, value);
    }
    return newResponse;
};

const handleCapabilities = (): Response => new Response(JSON.stringify({
    apiVersion: 2,
    annotations: {
        version: 1,
        maxImageBytes: MAX_ANNOTATION_IMAGE_BYTES,
        maxPayloadBytes: MAX_PAYLOAD_BYTES
    }
}), {
    status: 200,
    headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=300'
    }
});

export default {
    async fetch(request: Request, env: Env): Promise<Response> {
        if (request.method === 'OPTIONS') {
            return handleOptions(request);
        }

        const url = new URL(request.url);
        const path = url.pathname;

        let response: Response;

        if (path === '/api/capabilities' && request.method === 'GET') {
            response = handleCapabilities();
        } else if (path === '/api/share' && request.method === 'POST') {
            response = await handleCreateShare(request, env);
        } else if (path.startsWith('/api/share/') && request.method === 'GET') {
            const id = path.slice('/api/share/'.length);
            if (!id || id.includes('/')) {
                response = new Response(JSON.stringify({ error: 'Invalid share ID' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' }
                });
            } else {
                response = await handleGetShare(id, env);
            }
        } else {
            response = new Response(JSON.stringify({ error: 'Not found' }), {
                status: 404,
                headers: { 'Content-Type': 'application/json' }
            });
        }

        return addCorsHeaders(response, request);
    }
} satisfies ExportedHandler<Env>;
