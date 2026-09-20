import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const xrRoot = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(xrRoot, '../..');
const port = Number(process.env.PORT || 8080);

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.glb': 'model/gltf-binary',
    '.gltf': 'model/gltf+json',
    '.wasm': 'application/wasm',
    '.webmanifest': 'application/manifest+json',
    '.ply': 'application/octet-stream',
    '.splat': 'application/octet-stream',
    '.spz': 'application/octet-stream',
    '.ksplat': 'application/octet-stream'
};

function headersFor(filePath) {
    const ext = path.extname(filePath).toLowerCase();
    return {
        'Content-Type': MIME[ext] || 'application/octet-stream',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
        'Permissions-Policy': 'xr-spatial-tracking=*',
        'Feature-Policy': "xr-spatial-tracking '*'"
    };
}

function safeJoin(root, urlPath) {
    const decoded = decodeURIComponent(urlPath.split('?')[0] || '/');
    const trimmed = path.normalize(decoded).replace(/^[/\\]+/, '');
    if (trimmed.split(path.sep).includes('..')) return null;
    return path.join(root, trimmed);
}

const server = http.createServer((req, res) => {
    const urlPath = req.url || '/';
    const rel = urlPath.split('?')[0] === '/' ? '/index.html' : urlPath;
    const candidates = [safeJoin(xrRoot, rel), safeJoin(repoRoot, rel)].filter(Boolean);
    const file = candidates.find((candidate) => {
        try {
            return fs.existsSync(candidate) && fs.statSync(candidate).isFile();
        } catch {
            return false;
        }
    });

    if (!file) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
        res.end('Not found: ' + urlPath);
        return;
    }

    res.writeHead(200, headersFor(file));
    fs.createReadStream(file).pipe(res);
});

server.listen(port, () => {
    console.log('Quest XR server listening on http://localhost:' + port);
    console.log('Serving', xrRoot, 'and', repoRoot + '/assets');
});
