/* Classic script (not a module). Must run even if Three.js fails to load.
   Quest Browser often never fires click on HTML buttons; WebXR also requires
   a user activation, so we start the session on pointerdown/touchstart. */
(function () {
    var starting = false;
    var currentSession = null;
    var bound = false;

    function setStatus(message) {
        var nodes = document.querySelectorAll('#xr-start-status, #xr-bar-status');
        for (var i = 0; i < nodes.length; i++) nodes[i].textContent = message || '';
        var toast = document.getElementById('toast');
        if (toast && message) {
            toast.textContent = message;
            toast.classList.add('show');
            toast.classList.add('active');
        }
    }

    function setButtonLabels(mode, label) {
        var selector = mode === 'immersive-ar' ? '.xr-enter-ar, #ARButton' : '.xr-enter-vr, #VRButton';
        var buttons = document.querySelectorAll(selector);
        for (var i = 0; i < buttons.length; i++) buttons[i].textContent = label;
    }

    function ensureOverlay() {
        var overlay = document.getElementById('xr-dom-overlay');
        if (overlay) return overlay;
        overlay = document.createElement('div');
        overlay.id = 'xr-dom-overlay';
        overlay.className = 'xr-dom-overlay';
        overlay.innerHTML = '<button type="button" id="xr-overlay-exit" aria-label="Exit XR">Exit</button>';
        document.body.appendChild(overlay);
        overlay.querySelector('#xr-overlay-exit').addEventListener('click', function () {
            if (currentSession) currentSession.end();
        });
        return overlay;
    }

    function sessionOptions(mode) {
        // No requiredFeatures: Quest can hang forever if hit-test or local-floor
        // is required and the permission UI never appears.
        if (mode === 'immersive-ar') {
            return {
                optionalFeatures: [
                    'hit-test',
                    'local-floor',
                    'bounded-floor',
                    'dom-overlay',
                    'mesh-detection',
                    'plane-detection',
                    'hand-tracking'
                ],
                domOverlay: { root: ensureOverlay() }
            };
        }
        return {
            optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking']
        };
    }

    function attachWhenReady(session, mode) {
        if (typeof window.__attachXRSession === 'function') {
            window.__attachXRSession(session, mode);
            return;
        }
        var tries = 0;
        var id = setInterval(function () {
            tries += 1;
            if (typeof window.__attachXRSession === 'function') {
                clearInterval(id);
                window.__attachXRSession(session, mode);
            } else if (tries > 80) {
                clearInterval(id);
                setStatus('XR is on, but the 3D engine did not load. Check that Three.js can download, then reload.');
            }
        }, 100);
    }

    function onSessionEnded(mode) {
        currentSession = null;
        window.__xrSession = null;
        window.__xrMode = null;
        starting = false;
        setButtonLabels(mode, mode === 'immersive-ar' ? 'Enter AR' : 'Enter VR');
        setStatus('Tap Enter AR on the big button at the bottom');
        var overlay = document.getElementById('xr-dom-overlay');
        if (overlay) overlay.classList.remove('active');
    }

    function startSession(mode) {
        var shortName = mode === 'immersive-ar' ? 'AR' : 'VR';
        var options = sessionOptions(mode);
        var waitId = setTimeout(function () {
            if (starting && !currentSession) {
                setStatus('Waiting for Quest… look for a system permission prompt. If none appears, reload this page.');
            }
        }, 4000);

        var promise = navigator.xr.requestSession(mode, options);
        promise.then(function (session) {
            clearTimeout(waitId);
            currentSession = session;
            window.__xrSession = session;
            window.__xrMode = mode;
            starting = false;
            session.addEventListener('end', function () {
                onSessionEnded(mode);
            });
            var overlay = document.getElementById('xr-dom-overlay');
            if (overlay) overlay.classList.add('active');
            setStatus(shortName + ' session started. Connecting 3D engine…');
            setButtonLabels(mode, 'Exit ' + shortName);
            attachWhenReady(session, mode);
        }).catch(function (err) {
            clearTimeout(waitId);
            starting = false;
            var message = (err && err.message) ? err.message : String(err);
            console.warn('[XR] requestSession failed', mode, err);
            setStatus('Could not enter ' + shortName + ': ' + message);
            setButtonLabels(mode, 'Enter ' + shortName);
        });
    }

    window.enterQuestXR = function (mode, evt) {
        if (evt && evt.stopPropagation) evt.stopPropagation();

        mode = mode === 'immersive-vr' ? 'immersive-vr' : 'immersive-ar';
        var shortName = mode === 'immersive-ar' ? 'AR' : 'VR';

        try {
            if (starting) return;
            if (currentSession || window.__xrSession) {
                var existing = currentSession || window.__xrSession;
                existing.end();
                return;
            }

            if (!window.isSecureContext) {
                setStatus('WebXR needs HTTPS. Open the https:// site in Meta Quest Browser, not a http:// LAN address.');
                return;
            }
            if (!navigator.xr || typeof navigator.xr.requestSession !== 'function') {
                setStatus('This browser has no WebXR. Open this same URL in Meta Quest Browser on the headset.');
                return;
            }

            starting = true;
            setStatus('Starting ' + shortName + '… keep looking at the Quest permission prompt');
            setButtonLabels(mode, 'Starting ' + shortName + '…');
            startSession(mode);
        } catch (err) {
            starting = false;
            setStatus('XR click error: ' + ((err && err.message) ? err.message : err));
        }
    };

    function bindButton(el, mode) {
        if (!el || el.getAttribute('data-xr-bound') === '1') return;
        el.setAttribute('data-xr-bound', '1');
        el.setAttribute('role', 'button');
        el.type = 'button';

        function go(evt) {
            window.enterQuestXR(mode, evt);
        }

        el.addEventListener('pointerdown', go, true);
        el.addEventListener('touchstart', go, { capture: true, passive: false });
        el.addEventListener('click', go, true);
    }

    function bindAll() {
        var arButtons = document.querySelectorAll('.xr-enter-ar, #ARButton');
        var vrButtons = document.querySelectorAll('.xr-enter-vr, #VRButton');
        for (var i = 0; i < arButtons.length; i++) bindButton(arButtons[i], 'immersive-ar');
        for (var j = 0; j < vrButtons.length; j++) bindButton(vrButtons[j], 'immersive-vr');
        bound = true;
    }

    function reportSupport() {
        if (!window.isSecureContext) {
            setStatus('Open the https:// URL in Meta Quest Browser (WebXR is blocked on plain HTTP).');
            return;
        }
        if (!navigator.xr) {
            setStatus('No WebXR here. Open this page in Meta Quest Browser on the Quest 3.');
            return;
        }
        navigator.xr.isSessionSupported('immersive-ar').then(function (supported) {
            if (supported) {
                setStatus('AR ready — tap the big Enter AR button at the bottom');
                if (typeof navigator.xr.offerSession === 'function') {
                    navigator.xr.offerSession('immersive-ar', sessionOptions('immersive-ar')).then(function (session) {
                        if (currentSession || window.__xrSession) {
                            try { session.end(); } catch (e) { /* already in a session */ }
                            return;
                        }
                        currentSession = session;
                        window.__xrSession = session;
                        window.__xrMode = 'immersive-ar';
                        session.addEventListener('end', function () {
                            onSessionEnded('immersive-ar');
                        });
                        setButtonLabels('immersive-ar', 'Exit AR');
                        setStatus('AR session started. Connecting 3D engine…');
                        attachWhenReady(session, 'immersive-ar');
                    }).catch(function () {
                        /* offerSession idle until the user taps Enter AR */
                    });
                }
            } else {
                setStatus('Quest Browser says AR is not available on this page. Use Meta Quest Browser, HTTPS, and allow spatial tracking.');
            }
        }).catch(function (err) {
            setStatus('Could not check AR support: ' + ((err && err.message) ? err.message : err));
        });
    }

    bindAll();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
            bindAll();
            reportSupport();
        });
    } else {
        reportSupport();
    }
})();
