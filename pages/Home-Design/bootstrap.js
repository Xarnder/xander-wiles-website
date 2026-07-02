import { initAuth } from './auth.js';
import { subscribeIdeas } from './api.js';
import { initAdmin } from './admin.js';
import { initImageManager } from './image-manager.js';
import { app } from './firebase-config.js';

const config = app.options;
if (!config.apiKey || !config.projectId) {
    const message = 'Firebase is not configured. Add PUBLIC_HOME_DESIGN_FIREBASE_* to .env.local and run node build.js, or serve from deploy_out/.';
    console.error('[AtHome]', message);
    window.dispatchEvent(new CustomEvent('athome:error', {
        detail: { error: new Error(message) }
    }));
} else {
    initAuth();

    subscribeIdeas((rows, error) => {
        if (error) {
            window.dispatchEvent(new CustomEvent('athome:error', { detail: { error } }));
            return;
        }
        window.dispatchEvent(new CustomEvent('athome:data', { detail: { rows } }));
    });

    initAdmin();
    initImageManager();
}
