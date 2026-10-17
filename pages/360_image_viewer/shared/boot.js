// Injects the shared viewer markup, then starts viewer.js.
(function () {
    var scriptEl = document.currentScript;
    var baseUrl = new URL('./', scriptEl.src);

    function fail(message) {
        var mount = document.getElementById('viewer-mount');
        if (!mount) return;
        var note = document.createElement('p');
        note.className = 'viewer-boot-error';
        note.textContent = message;
        mount.replaceChildren(note);
    }

    fetch(new URL('shell.html', baseUrl))
        .then(function (response) {
            if (!response.ok) {
                throw new Error('Could not load the shared 360° viewer (' + response.status + ').');
            }
            return response.text();
        })
        .then(function (html) {
            var mount = document.getElementById('viewer-mount');
            if (!mount) throw new Error('This page is missing #viewer-mount.');
            mount.innerHTML = html;

            var api = window.PanoramaViewerConfig;
            if (!api) throw new Error('Panorama viewer config failed to load.');
            api.applyViewerChrome(api.resolveViewerConfig(window.PANORAMA_VIEWER), document);

            var viewer = document.createElement('script');
            viewer.src = new URL('viewer.js', baseUrl).href;
            viewer.async = false;
            document.body.appendChild(viewer);
        })
        .catch(function (err) {
            console.error(err);
            fail(err && err.message ? err.message : 'Could not start the 360° viewer.');
        });
})();
