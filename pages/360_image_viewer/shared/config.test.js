const test = require('node:test');
const assert = require('node:assert/strict');
const {
    resolveViewerConfig,
    normalizeManifestEntry,
    manifestItems,
    zoomPercentFromFov,
    fovFromZoomPercent,
    formatZoom,
    displayName,
    formatLens,
    applyViewerChrome,
    DEFAULT_FOV
} = require('./config.js');

test('default config matches the original viewer', () => {
    const config = resolveViewerConfig();
    assert.equal(config.title, '360° VR Viewer');
    assert.equal(config.subtitle, '');
    assert.equal(config.assetFolder, 'assets/360-images/');
    assert.equal(config.manifestUrl, 'assets/360-images/manifest.json');
    assert.equal(config.lookHudKey, 'xw-360-look-hud-hidden');
    assert.equal(config.hintKey, 'xw-360-hint-dismissed');
    assert.equal(config.emptyLabel, 'Waiting for input...');
    assert.equal(config.emptyLog, '');
    assert.deepEqual(config.collections, [{
        title: '',
        assetFolder: 'assets/360-images/',
        manifestUrl: 'assets/360-images/manifest.json'
    }]);
});

test('pages keep independent image collections and saved preferences', () => {
    const main = resolveViewerConfig({
        title: '360° VR Viewer',
        assetFolder: 'assets/360-images/',
        manifestUrl: 'assets/360-images/manifest.json',
        storageNamespace: 'xw-360'
    });
    const cathedral = resolveViewerConfig({
        title: 'Guildford Cathedral',
        subtitle: '360° photographs',
        assetFolder: 'images/',
        manifestUrl: 'images/manifest.json',
        storageNamespace: 'xw-360-guildford',
        emptyLabel: 'No images yet',
        emptyLog: 'Add images to the manifest.'
    });

    assert.equal(cathedral.title, 'Guildford Cathedral');
    assert.equal(cathedral.manifestUrl, 'images/manifest.json');
    assert.equal(cathedral.assetFolder, 'images/');
    assert.notEqual(main.manifestUrl, cathedral.manifestUrl);
    assert.notEqual(main.lookHudKey, cathedral.lookHudKey);
    assert.equal(cathedral.lookHudKey, 'xw-360-guildford-look-hud-hidden');
    assert.equal(main.title, '360° VR Viewer');
});

test('manifest entries stay local filenames', () => {
    const named = normalizeManifestEntry(
        { name: 'Water Park', preview: 'water park.webp', full: 'water-park.jpg' },
        'assets/360-images/'
    );
    assert.equal(named.name, 'Water Park');
    assert.equal(named.preview, encodeURI('assets/360-images/water park.webp'));
    assert.equal(named.full, encodeURI('assets/360-images/water-park.jpg'));
    assert.equal(named.preview.startsWith('http'), false);
    assert.equal(named.group, '');

    const grouped = manifestItems(
        [{ name: 'Guildford Cathedral 01', preview: 'Low_Res_Guildford_Cathedral/Guildford Cathedral 01.webp', full: 'Full_Res_Guildford_Cathedral/Full_Res_Guildford_Cathedral_01.jpg' }],
        'guildford-cathedral/images/',
        'Guildford Cathedral'
    );
    assert.equal(grouped[0].group, 'Guildford Cathedral');
    assert.match(grouped[0].preview, /^guildford-cathedral\/images\/Low_Res_Guildford_Cathedral\//);

    const fromName = normalizeManifestEntry('garden 1.webp', 'images');
    assert.equal(fromName.preview, encodeURI('images/garden 1.webp'));
    assert.equal(fromName.full, null);

    assert.deepEqual(manifestItems([], 'images/'), []);
    assert.throws(() => manifestItems({ images: [] }, 'images/'), /JSON array/);
});

test('zoom mapping stays on the original slider', () => {
    assert.equal(DEFAULT_FOV, 80);
    assert.equal(zoomPercentFromFov(80), 25);
    assert.equal(fovFromZoomPercent(25), 80);
    assert.equal(formatZoom(80), '1.0×');
    assert.equal(formatZoom(40), '2.0×');
    assert.equal(formatLens(0), 'Rectilinear');
    assert.equal(formatLens(1), 'Panini');
    assert.equal(formatLens(0.42), '42');
    assert.equal(displayName({ name: 'garden 1.webp' }), 'garden 1');
    assert.equal(displayName({ name: 'Water Park' }), 'Water Park');
});

test('chrome applies a page title without requiring a subtitle', () => {
    const els = {};
    function make(className) {
        const classes = new Set(className ? className.split(/\s+/) : []);
        return {
            textContent: '',
            classList: {
                toggle(name, on) {
                    if (on) classes.add(name);
                    else classes.delete(name);
                },
                contains(name) {
                    return classes.has(name);
                }
            }
        };
    }
    els.viewerTitle = make();
    els.viewerSubtitle = make('hidden');
    els.currentFileName = make();
    const doc = { getElementById: (id) => els[id] };

    applyViewerChrome(resolveViewerConfig(), doc);
    assert.equal(els.viewerTitle.textContent, '360° VR Viewer');
    assert.equal(els.viewerSubtitle.textContent, '');
    assert.equal(els.viewerSubtitle.classList.contains('hidden'), true);
    assert.equal(els.currentFileName.textContent, 'Waiting for input...');

    applyViewerChrome(resolveViewerConfig({
        title: 'Guildford Cathedral',
        subtitle: '360° photographs',
        emptyLabel: 'No images yet'
    }), doc);
    assert.equal(els.viewerTitle.textContent, 'Guildford Cathedral');
    assert.equal(els.viewerSubtitle.textContent, '360° photographs');
    assert.equal(els.viewerSubtitle.classList.contains('hidden'), false);
    assert.equal(els.currentFileName.textContent, 'No images yet');
});
