// Page-specific settings for the shared 360° viewer.
// Loaded as a classic script in the browser and as CommonJS in tests.
(function (root, factory) {
    var api = factory();
    if (typeof module === 'object' && module.exports) {
        module.exports = api;
    }
    root.PanoramaViewerConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    var FOV_MIN = 20;
    var FOV_MAX = 100;
    var DEFAULT_FOV = 80;
    var DEFAULT_TITLE = '360° VR Viewer';
    var DEFAULT_EMPTY_LABEL = 'Waiting for input...';
    var DEFAULT_FOLDER = 'assets/360-images/';
    var DEFAULT_NAMESPACE = 'xw-360';

    function ensureTrailingSlash(folder) {
        var value = String(folder || '');
        return value.endsWith('/') ? value : value + '/';
    }

    function resolveViewerConfig(input) {
        var raw = input && typeof input === 'object' ? input : {};
        var assetFolder = ensureTrailingSlash(raw.assetFolder || DEFAULT_FOLDER);
        var storageNamespace = String(raw.storageNamespace || DEFAULT_NAMESPACE);
        var subtitle = String(raw.subtitle || '').trim();
        return {
            title: raw.title ? String(raw.title) : DEFAULT_TITLE,
            subtitle: subtitle,
            assetFolder: assetFolder,
            manifestUrl: raw.manifestUrl ? String(raw.manifestUrl) : assetFolder + 'manifest.json',
            storageNamespace: storageNamespace,
            lookHudKey: storageNamespace + '-look-hud-hidden',
            hintKey: storageNamespace + '-hint-dismissed',
            emptyLabel: raw.emptyLabel ? String(raw.emptyLabel) : DEFAULT_EMPTY_LABEL,
            emptyLog: raw.emptyLog ? String(raw.emptyLog) : '',
            collections: resolveCollections(raw, assetFolder, raw.manifestUrl ? String(raw.manifestUrl) : assetFolder + 'manifest.json')
        };
    }

    function resolveCollections(raw, assetFolder, manifestUrl) {
        if (Array.isArray(raw.collections) && raw.collections.length) {
            return raw.collections.map(function (collection) {
                var source = collection && typeof collection === 'object' ? collection : {};
                var folder = ensureTrailingSlash(source.assetFolder || assetFolder);
                return {
                    title: source.title ? String(source.title) : '',
                    assetFolder: folder,
                    manifestUrl: source.manifestUrl ? String(source.manifestUrl) : folder + 'manifest.json'
                };
            });
        }
        return [{
            title: '',
            assetFolder: assetFolder,
            manifestUrl: manifestUrl
        }];
    }

    function assetUrl(folder, filename) {
        return encodeURI(ensureTrailingSlash(folder) + filename);
    }

    function normalizeManifestEntry(entry, folder, group) {
        var label = group ? String(group) : '';
        if (typeof entry === 'string') {
            return { name: entry, preview: assetUrl(folder, entry), full: null, file: null, flipped: false, group: label };
        }
        if (!entry || typeof entry !== 'object') {
            return { name: 'Untitled', preview: null, full: null, file: null, flipped: false, group: label };
        }
        if (!label && entry.group) label = String(entry.group);
        return {
            name: entry.name || entry.full || entry.preview,
            preview: entry.preview ? assetUrl(folder, entry.preview) : null,
            full: entry.full ? assetUrl(folder, entry.full) : null,
            file: null,
            flipped: false,
            group: label
        };
    }

    function manifestItems(fileList, folder, group) {
        if (!Array.isArray(fileList)) {
            throw new Error('Manifest must be a JSON array of images');
        }
        return fileList.map(function (entry) {
            return normalizeManifestEntry(entry, folder, group);
        });
    }

    function zoomPercentFromFov(fov) {
        return ((FOV_MAX - fov) / (FOV_MAX - FOV_MIN)) * 100;
    }

    function fovFromZoomPercent(percent) {
        return FOV_MAX - (percent / 100) * (FOV_MAX - FOV_MIN);
    }

    function formatZoom(fov) {
        var zoom = DEFAULT_FOV / fov;
        return zoom.toFixed(zoom >= 10 ? 0 : 1) + '×';
    }

    function displayName(item) {
        var raw = (item && (item.name || '')) || '';
        return raw.replace(/\.(jpe?g|png|webp)$/i, '') || raw || 'Untitled';
    }

    function formatLens(amount) {
        if (amount <= 0.01) return 'Rectilinear';
        if (amount >= 0.99) return 'Panini';
        return String(Math.round(amount * 100));
    }

    function applyViewerChrome(config, doc) {
        if (!doc || typeof doc.getElementById !== 'function') return;
        var titleEl = doc.getElementById('viewerTitle');
        if (titleEl) titleEl.textContent = config.title;
        var subtitleEl = doc.getElementById('viewerSubtitle');
        if (subtitleEl) {
            subtitleEl.textContent = config.subtitle || '';
            if (subtitleEl.classList) subtitleEl.classList.toggle('hidden', !config.subtitle);
        }
        var nameEl = doc.getElementById('currentFileName');
        if (nameEl) nameEl.textContent = config.emptyLabel;
    }

    return {
        FOV_MIN: FOV_MIN,
        FOV_MAX: FOV_MAX,
        DEFAULT_FOV: DEFAULT_FOV,
        resolveViewerConfig: resolveViewerConfig,
        normalizeManifestEntry: normalizeManifestEntry,
        manifestItems: manifestItems,
        assetUrl: assetUrl,
        zoomPercentFromFov: zoomPercentFromFov,
        fovFromZoomPercent: fovFromZoomPercent,
        formatZoom: formatZoom,
        displayName: displayName,
        formatLens: formatLens,
        applyViewerChrome: applyViewerChrome
    };
});
