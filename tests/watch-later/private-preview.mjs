// Run from the repository root: node tests/watch-later/private-preview.mjs
// Serves the real app with isolated test services, without authentication or production writes.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
const root = resolve(import.meta.dirname, '../..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon' };
const firebase = ['app', 'auth', 'firestore'].map(name => [`https://www.gstatic.com/firebasejs/10.7.1/firebase-${name}.js`, '/tests/watch-later/private-fixture.mjs']);
http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://localhost');
    const path = resolve(root, '.' + decodeURIComponent(url.pathname.endsWith('/') ? url.pathname + 'index.html' : url.pathname));
    if (!path.startsWith(root + '/')) { response.writeHead(403).end(); return; }
    try {
        let content = await readFile(path);
        if (path.endsWith('.html') && path.includes('/Watch-Later/')) {
            content = content.toString().replace('<head>', `<head><script type="importmap">${JSON.stringify({ imports: Object.fromEntries(firebase) })}</script><script>
                const realFetch = window.fetch.bind(window);
                window.fetch = (url, options) => String(url).includes('omdbapi.com') ? Promise.resolve(new Response(JSON.stringify({ Response: 'False' })))
                    : String(url).includes('youtube.com/oembed') ? Promise.resolve(new Response(JSON.stringify({ title: 'Imported title | Official Trailer' }))) : realFetch(url, options);
                ${url.searchParams.has('largeText') ? "document.documentElement.style.fontSize = '32px';" : ''}
            </script>`);
        }
        response.writeHead(200, { 'Content-Type': types[extname(path)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(content);
    } catch { response.writeHead(404).end(); }
}).listen(3108, '127.0.0.1', () => console.log('Isolated Watch Later preview: http://127.0.0.1:3108/pages/Watch-Later/private.html'));
