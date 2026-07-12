const apiBaseUrl = process.env.SHARE_API_BASE_URL;
if (!apiBaseUrl) {
    throw new Error('Set SHARE_API_BASE_URL to the deployed share API origin.');
}

const apiBase = apiBaseUrl.replace(/\/$/, '');
const pngDataUrl =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';

const wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
const getCapabilities = async () => {
    let response = null;
    for (let attempt = 1; attempt <= 10; attempt += 1) {
        response = await fetch(`${apiBase}/api/capabilities?attempt=${attempt}`, {
            headers: { 'Cache-Control': 'no-cache' }
        });
        if (response.ok) {
            return response;
        }
        await wait(2_000);
    }
    return response;
};

const capabilitiesResponse = await getCapabilities();
if (!capabilitiesResponse) {
    throw new Error('Capabilities check did not return a response.');
}
if (!capabilitiesResponse.ok) {
    throw new Error(`Capabilities check failed with HTTP ${capabilitiesResponse.status}.`);
}
const capabilities = await capabilitiesResponse.json();
if (capabilities.apiVersion !== 2 || capabilities.annotations?.version !== 1) {
    throw new Error('Deployed API does not advertise annotation support.');
}

const createResponse = await fetch(`${apiBase}/api/share`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        videoId: 'smokeTEST01',
        title: 'Annotation deployment smoke test',
        notes: [{
            timestamp: 1,
            text: '',
            annotation: {
                version: 1,
                image: {
                    dataUrl: pngDataUrl,
                    width: 1,
                    height: 1,
                    generatedAt: Date.now()
                },
                viewport: {
                    width: 960,
                    height: 540
                }
            }
        }]
    })
});

if (!createResponse.ok) {
    throw new Error(`Share creation failed with HTTP ${createResponse.status}: ${await createResponse.text()}`);
}

const created = await createResponse.json();
if (typeof created.id !== 'string' || typeof created.url !== 'string') {
    throw new Error('Share creation response is missing its ID or viewer URL.');
}

const retrieveResponse = await fetch(`${apiBase}/api/share/${encodeURIComponent(created.id)}`);
if (!retrieveResponse.ok) {
    throw new Error(`Share retrieval failed with HTTP ${retrieveResponse.status}.`);
}
const retrieved = await retrieveResponse.json();
const retrievedNote = retrieved.notes?.[0];
if (retrievedNote?.text !== '' || retrievedNote?.annotation?.image?.dataUrl !== pngDataUrl) {
    throw new Error('Retrieved share did not preserve the drawing-only annotation.');
}

const viewerScriptUrl = new URL('share.js', created.url);
const viewerResponse = await fetch(viewerScriptUrl);
if (!viewerResponse.ok || !(await viewerResponse.text()).includes('annotation-overlay')) {
    throw new Error('Deployed share viewer does not contain annotation rendering support.');
}

process.stdout.write(`Share deployment smoke test passed: ${created.url}\n`);
