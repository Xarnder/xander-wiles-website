/**
 * Development server with local API endpoint support (/api/*) and static file serving.
 * Automatically loads .env and .env.local so GEMINI_API_KEY and other credentials work locally.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Load environment variables
try {
    const dotenv = await import('dotenv');
    dotenv.config();
    dotenv.config({ path: '.env.local', override: true });
} catch {
    // ignore if dotenv not present
}

const __filename = fileURLToPath(import.meta.url);
const rootDir = path.dirname(__filename);
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain; charset=utf-8',
    '.csv': 'text/csv; charset=utf-8',
    '.wasm': 'application/wasm',
};

async function handleApiRequest(req, res, apiFile) {
    const filePath = path.join(rootDir, 'api', apiFile);
    if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'API route not found' }));
        return;
    }

    try {
        const module = await import(`${filePath}?t=${Date.now()}`);
        const handler = module.default;
        if (typeof handler !== 'function') {
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid API handler' }));
            return;
        }

        const bodyChunks = [];
        for await (const chunk of req) {
            bodyChunks.push(chunk);
        }
        const bodyBuffer = Buffer.concat(bodyChunks);

        const protocol = req.headers['x-forwarded-proto'] || 'http';
        const url = new URL(req.url, `${protocol}://${req.headers.host || 'localhost'}`);
        const webHeaders = new Headers();
        for (const [key, value] of Object.entries(req.headers)) {
            if (Array.isArray(value)) {
                for (const v of value) webHeaders.append(key, v);
            } else if (value !== undefined) {
                webHeaders.set(key, value);
            }
        }

        const webRequest = new Request(url.href, {
            method: req.method,
            headers: webHeaders,
            body: req.method !== 'GET' && req.method !== 'HEAD' ? bodyBuffer : undefined,
        });

        const webResponse = await handler(webRequest);
        const resHeaders = {};
        for (const [k, v] of webResponse.headers.entries()) {
            resHeaders[k] = v;
        }
        res.writeHead(webResponse.status, resHeaders);
        const arrayBuffer = await webResponse.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
    } catch (err) {
        console.error('[dev-server] API error:', err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: err?.message || 'Internal server error' }));
    }
}

function serveStatic(req, res, pathname) {
    let cleanPath = decodeURIComponent(pathname.split('?')[0]);
    if (cleanPath.endsWith('/')) {
        cleanPath += 'index.html';
    }

    let filePath = path.join(rootDir, cleanPath);

    // If it is a directory, check for index.html
    try {
        if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
            filePath = path.join(filePath, 'index.html');
        }
    } catch {}

    // Clean URL check (.html omitted)
    if (!fs.existsSync(filePath)) {
        if (fs.existsSync(filePath + '.html')) {
            filePath = filePath + '.html';
        }
    }

    // SPA rewrites from serve.json
    if (!fs.existsSync(filePath)) {
        if (cleanPath.startsWith('/pages/Routine')) {
            filePath = path.join(rootDir, 'pages/Routine/200.html');
        } else if (cleanPath.startsWith('/pages/journal')) {
            filePath = path.join(rootDir, 'pages/journal/index.html');
        }
    }

    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('404 Not Found');
        return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const headers = { 'Content-Type': contentType };

    if (cleanPath.startsWith('/pages/Silence-Cutter/')) {
        headers['Cross-Origin-Opener-Policy'] = 'same-origin';
        headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
    }

    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
}

const server = http.createServer(async (req, res) => {
    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const pathname = parsedUrl.pathname;

    if (pathname === '/api/markdown-gemini' || pathname === '/api/markdown-gemini.js') {
        return handleApiRequest(req, res, 'markdown-gemini.js');
    }
    if (pathname === '/api/generate-list' || pathname === '/api/generate-list.js') {
        return handleApiRequest(req, res, 'generate-list.js');
    }

    serveStatic(req, res, pathname);
});

server.listen(PORT, () => {
    console.log(`\n  Local Dev Server ready at: http://localhost:${PORT}/`);
    console.log(`  Markdown Editor: http://localhost:${PORT}/pages/Markdown-Editor/\n`);
});
