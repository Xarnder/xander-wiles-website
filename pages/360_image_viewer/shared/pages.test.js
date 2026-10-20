const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { resolveViewerConfig, manifestItems } = require('./config.js');

const pageRoot = path.join(__dirname, '..');

function read(rel) {
    return fs.readFileSync(path.join(pageRoot, rel), 'utf8');
}

function pageConfig(html) {
    const marker = html.indexOf('window.PANORAMA_VIEWER');
    const start = html.indexOf('{', marker);
    assert.ok(start >= 0, 'page is missing PANORAMA_VIEWER');
    let depth = 0;
    let quote = '';
    for (let i = start; i < html.length; i++) {
        const ch = html[i];
        if (quote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote) quote = '';
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '{') depth += 1;
        if (ch === '}') {
            depth -= 1;
            if (depth === 0) return Function('return ' + html.slice(start, i + 1))();
        }
    }
    throw new Error('PANORAMA_VIEWER object did not close');
}

test('both pages mount the same viewer files', () => {
    const main = read('index.html');
    const cathedral = read('guildford-cathedral/index.html');
    const shell = read('shared/shell.html');
    const boot = read('shared/boot.js');
    const viewer = read('shared/viewer.js');

    for (const html of [main, cathedral]) {
        assert.match(html, /shared\/viewer\.css/);
        assert.match(html, /shared\/config\.js/);
        assert.match(html, /shared\/boot\.js/);
        assert.ok(html.indexOf('shared/config.js') < html.indexOf('shared/boot.js'));
        assert.doesNotMatch(html, /<a-scene/);
        assert.doesNotMatch(html, /id="fovSlider"/);
        assert.doesNotMatch(html, /script\.js/);
        assert.doesNotMatch(html, /style\.css/);
    }

    assert.match(shell, /<a-scene/);
    assert.match(shell, /id="fovSlider"/);
    assert.match(shell, /id="wanderBtn"/);
    assert.match(shell, /id="viewerTitle"/);
    assert.doesNotMatch(shell, /<script/);

    assert.match(boot, /shell\.html/);
    assert.match(boot, /viewer\.js/);
    assert.match(viewer, /viewerConfig\.collections/);
    assert.equal(viewer.includes("const demoFolder = 'assets/360-images/'"), false);
    assert.equal(viewer.includes('function normalizeManifestEntry'), false);
    assert.equal(fs.existsSync(path.join(pageRoot, 'script.js')), false);
    assert.equal(fs.existsSync(path.join(pageRoot, 'style.css')), false);

    const mainUrl = path.resolve(pageRoot, 'shared/viewer.js');
    const cathedralUrl = path.resolve(pageRoot, 'guildford-cathedral', '../shared/viewer.js');
    assert.equal(mainUrl, cathedralUrl);
    assert.match(shell, /class="panel-body"/);
});

test('phone and touch layout stays shared across both pages', () => {
    const query = '(max-width: 600px) and (orientation: portrait), (max-height: 500px) and (orientation: landscape) and (pointer: coarse)';
    const main = read('index.html');
    const cathedral = read('guildford-cathedral/index.html');
    const viewer = read('shared/viewer.js');
    const css = read('shared/viewer.css');

    assert.ok(main.includes(query));
    assert.ok(cathedral.includes(query));
    assert.ok(viewer.includes(query));
    assert.match(css, /touch-action: manipulation/);
    assert.match(css, /\.gallery-grid[\s\S]*min-height: 0/);
    assert.match(css, /\.panel-body[\s\S]*touch-action: pan-y/);
});

test('Guildford Cathedral config pairs low-res previews with full-res images', () => {
    const main = resolveViewerConfig(pageConfig(read('index.html')));
    const cathedral = resolveViewerConfig(pageConfig(read('guildford-cathedral/index.html')));
    const manifestPath = path.join(pageRoot, 'guildford-cathedral', cathedral.manifestUrl);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const imageRoot = path.join(pageRoot, 'guildford-cathedral/images');

    assert.equal(main.title, '360° VR Viewer');
    assert.equal(main.manifestUrl, 'assets/360-images/manifest.json');
    assert.equal(main.storageNamespace, 'xw-360');
    assert.equal(cathedral.title, 'Guildford Cathedral');
    assert.equal(cathedral.assetFolder, 'images/');
    assert.equal(cathedral.manifestUrl, 'images/manifest.json');
    assert.equal(cathedral.storageNamespace, 'xw-360-guildford');
    assert.notEqual(main.manifestUrl, cathedral.manifestUrl);
    assert.equal(cathedral.collections.length, 1);
    assert.equal(cathedral.collections[0].title, '');
    assert.equal(cathedral.collections[0].manifestUrl, 'images/manifest.json');
    assert.deepEqual(main.collections.map((collection) => collection.title), ['', 'Guildford Cathedral']);
    assert.equal(main.collections[0].manifestUrl, 'assets/360-images/manifest.json');
    assert.equal(main.collections[1].manifestUrl, 'guildford-cathedral/images/manifest.json');
    assert.equal(main.collections[1].assetFolder, 'guildford-cathedral/images/');
    assert.equal(manifest.length, 25);
    const featuredOrder = [11, 9, 10, 12, 13, 14, 15, 16, 1, 2, 3, 4, 5, 6, 7, 8, 17, 18, 19, 20, 21, 22, 23, 24, 25];
    assert.deepEqual(manifest.map((entry) => Number(entry.name.slice(-2))), featuredOrder);

    manifest.forEach((entry) => {
        const n = entry.name.slice(-2);
        assert.equal(entry.name, `Guildford Cathedral ${n}`);
        assert.equal(entry.preview, `Low_Res_Guildford_Cathedral/Guildford Cathedral ${n}.webp`);
        assert.equal(entry.full, `Full_Res_Guildford_Cathedral/Full_Res_Guildford_Cathedral_${n}.jpg`);
        assert.equal(fs.existsSync(path.join(imageRoot, entry.preview)), true);
        assert.equal(fs.existsSync(path.join(imageRoot, entry.full)), true);
    });

    const items = manifestItems(manifest, cathedral.assetFolder);
    assert.equal(items[0].group, '');
    const mainItems = manifestItems(manifest, main.collections[1].assetFolder, main.collections[1].title);
    assert.equal(mainItems[0].group, 'Guildford Cathedral');
    assert.equal(fs.existsSync(path.join(pageRoot, decodeURI(mainItems[0].preview))), true);
    assert.equal(fs.existsSync(path.join(pageRoot, decodeURI(mainItems[0].full))), true);
    assert.match(items[0].preview, /^images\/Low_Res_Guildford_Cathedral\//);
    assert.match(items[0].full, /^images\/Full_Res_Guildford_Cathedral\//);
    assert.equal(items[0].preview.includes('%20'), true);
    assert.equal(read('guildford-cathedral/index.html').includes('manifest.example.json'), false);
    assert.match(read('guildford-cathedral/index.html'), /page-guildford/);
    assert.match(read('guildford-cathedral/index.html'), /href="favicon-dark\.svg"/);
    assert.match(read('guildford-cathedral/index.html'), /href="favicon-light\.svg"/);
    assert.match(read('guildford-cathedral/index.html'), /href="apple-touch-icon\.png"/);
    assert.match(read('guildford-cathedral/index.html'), /href="site\.webmanifest"/);
    assert.equal(read('guildford-cathedral/index.html').includes('../favicon.ico'), false);
    const catalogue = read('../All-Pages/index.html');
    const catalogueCard = catalogue.indexOf('/pages/360_image_viewer/guildford-cathedral/');
    assert.ok(catalogueCard > catalogue.indexOf('id="guides"'));
    assert.ok(catalogue.slice(catalogue.indexOf('id="images"'), catalogue.indexOf('id="guides"')).includes('guildford-cathedral') === false);
    const nav = read('../../nav.html');
    const imagesMenu = nav.slice(nav.indexOf('id="nav-images-menu"'), nav.indexOf('id="nav-guides-menu"'));
    const guidesMenu = nav.slice(nav.indexOf('id="nav-guides-menu"'), nav.indexOf('id="nav-playlists-menu"'));
    assert.equal(imagesMenu.includes('guildford-cathedral'), false);
    assert.match(guidesMenu, /guildford-cathedral\/favicon-dark\.svg/);
    assert.match(read('guildford-cathedral/index.html'), /page\.css/);
    assert.doesNotMatch(read('index.html'), /page-guildford/);
    assert.doesNotMatch(read('index.html'), /page\.css/);
});
