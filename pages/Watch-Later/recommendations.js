import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import {
    getAuth,
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    onAuthStateChanged,
    signOut,
    setPersistence,
    browserLocalPersistence,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import {
    getFirestore,
    collection,
    onSnapshot,
    doc,
    setDoc,
    updateDoc,
    deleteDoc,
    serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import {
    TIERS,
    PUBLIC_COLLECTION,
    isOwner,
    safeImageUrl,
    youtubeId,
    recommendationPayload,
    filterRecommendations,
} from './recommendations-model.mjs';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const $ = (id) => document.getElementById(id);
const board = $('tier-board');
const editor = $('recommendation-editor');
const form = $('recommendation-form');
const removeDialog = $('remove-dialog');
const signInButton = $('owner-sign-in');
let user = null;
let items = [];
let type = 'all';
let search = '';
let editingId = null;
let editingItem = null;
let unsubscribe = null;
let loaded = false;
let failed = false;
let saving = false;
let toastTimer;

const persistence = setPersistence(auth, browserLocalPersistence).catch(() => {
    $('account-status').textContent =
        'Sign-in will last for this session only.';
});
getRedirectResult(auth).catch(() => {
    $('account-status').textContent =
        'Sign-in could not be completed. Please try again.';
});

function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function toast(message) {
    $('toast').textContent = message;
    $('toast').hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        $('toast').hidden = true;
    }, 4500);
}

function showState(title, description, loading = false) {
    const state = $('collection-state');
    state.replaceChildren(
        element(
            'span',
            loading ? 'loading-ring' : 'state-icon',
            loading ? '' : '↗',
        ),
        element('h3', '', title),
        element('p', '', description),
    );
    state.firstChild.setAttribute('aria-hidden', 'true');
    state.hidden = false;
}

function card(item) {
    const article = element('article', 'recommendation-card');
    const cover = element('div', 'cover');
    const fallback = element(
        'span',
        'cover-fallback',
        item.title.slice(0, 2).toUpperCase(),
    );
    fallback.setAttribute('aria-hidden', 'true');
    cover.append(fallback);
    const videoId = youtubeId(item.trailerUrl);
    const imageUrl =
        safeImageUrl(item.imageUrl) ||
        (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : '');
    if (imageUrl) {
        const img = element('img');
        img.alt = '';
        img.loading = 'lazy';
        img.referrerPolicy = 'no-referrer';
        img.src = imageUrl;
        img.addEventListener('error', () => img.remove(), { once: true });
        cover.append(img);
    }
    cover.append(
        element(
            'span',
            'media-type',
            item.type === 'movie' ? 'MOVIE' : 'TV SHOW',
        ),
    );
    const body = element('div', 'card-body');
    body.append(element('h3', '', item.title));
    const meta = [item.year, item.genre].filter(Boolean).join(' · ');
    if (meta) body.append(element('p', 'card-meta', meta));
    if (item.note) body.append(element('p', 'card-note', item.note));
    if (videoId || isOwner(user)) {
        const actions = element('div', 'card-actions');
        if (videoId) {
            const link = element('a', 'trailer-link', '▷ Watch trailer');
            link.href = `https://www.youtube.com/watch?v=${videoId}`;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.setAttribute(
                'aria-label',
                `Watch ${item.title} trailer (opens in a new tab)`,
            );
            actions.append(link);
        }
        if (isOwner(user)) {
            const edit = element('button', 'edit-pick', 'Edit pick');
            edit.type = 'button';
            edit.setAttribute('aria-label', `Edit ${item.title}`);
            edit.addEventListener('click', () => openEditor(item));
            actions.append(edit);
        }
        body.append(actions);
    }
    article.append(cover, body);
    return article;
}

function render() {
    if (!loaded || failed) return;
    const visible = filterRecommendations(items, { type, search });
    $('collection-count').textContent =
        `${visible.length} ${visible.length === 1 ? 'pick' : 'picks'}${visible.length !== items.length ? ` / ${items.length} total` : ''}`;
    $('collection-state').hidden = true;
    if (!items.length) {
        showState(
            'The collection is taking shape.',
            isOwner(user)
                ? 'Add your first recommendation above. It will appear here for everyone to explore.'
                : 'Xander hasn’t published any recommendations yet. Check back for the first picks.',
        );
    } else if (!visible.length) {
        showState(
            'No picks found just yet.',
            'Try another title or genre, or switch back to Everything.',
        );
    }
    const fragment = document.createDocumentFragment();
    TIERS.forEach((tier) => {
        const entries = visible.filter((item) => item.tier === tier.id);
        const row = element('section', 'tier-row');
        row.dataset.tier = tier.id;
        row.setAttribute('aria-labelledby', `tier-${tier.id}`);
        const label = element('div', 'tier-label');
        const chip = element('span', 'tier-chip', tier.id);
        chip.setAttribute('aria-label', `Tier ${tier.id}`);
        const heading = element('h3', '', tier.name);
        heading.id = `tier-${tier.id}`;
        label.append(
            chip,
            heading,
            element('p', '', tier.description),
            element(
                'small',
                '',
                `${entries.length} ${entries.length === 1 ? 'pick' : 'picks'}`,
            ),
        );
        const list = element('div', 'tier-items');
        entries.forEach((item) => list.append(card(item)));
        if (!entries.length)
            list.append(
                element(
                    'p',
                    'empty-tier',
                    search || type !== 'all'
                        ? 'No matching picks in this tier.'
                        : 'Room for the next good recommendation.',
                ),
            );
        row.append(label, list);
        fragment.append(row);
    });
    board.replaceChildren(fragment);
}

function subscribe() {
    unsubscribe?.();
    failed = false;
    loaded = false;
    board.replaceChildren();
    board.setAttribute('aria-busy', 'true');
    $('retry').hidden = true;
    $('collection-count').textContent = 'Loading collection…';
    showState(
        'Opening the collection…',
        'The next good watch is worth a moment.',
        true,
    );
    // This page never reads watches, tiers, people, or any private document.
    unsubscribe = onSnapshot(
        collection(db, PUBLIC_COLLECTION),
        (snapshot) => {
            items = snapshot.docs.flatMap((record) => {
                try {
                    return [
                        {
                            ...recommendationPayload(record.data()),
                            id: record.id,
                        },
                    ];
                } catch {
                    return [];
                } // A malformed public document must not break the whole board.
            });
            loaded = true;
            failed = false;
            board.setAttribute('aria-busy', 'false');
            render();
        },
        (error) => {
            console.error('Public collection could not load:', error.code);
            failed = true;
            items = [];
            board.replaceChildren();
            board.setAttribute('aria-busy', 'false');
            $('collection-count').textContent = 'Collection unavailable';
            showState(
                'The collection couldn’t load.',
                'Please try again in a moment.',
            );
            $('retry').hidden = false;
        },
    );
}

function openEditor(item = null) {
    if (!isOwner(user) || saving) return;
    editingId = item?.id || doc(collection(db, PUBLIC_COLLECTION)).id;
    editingItem = item;
    form.reset();
    $('form-error').hidden = true;
    $('remove-recommendation').hidden = !item;
    $('editor-title').textContent = item
        ? 'Edit recommendation'
        : 'Add a recommendation';
    $('publish').textContent = item
        ? 'Save public changes'
        : 'Publish recommendation';
    const initial = item || {
        tier: 'A',
        type: 'movie',
        rank: Math.min(
            9999,
            items.reduce((max, entry) => Math.max(max, entry.rank), -1) + 1,
        ),
    };
    for (const key of [
        'title',
        'type',
        'tier',
        'note',
        'genre',
        'year',
        'trailerUrl',
        'imageUrl',
        'rank',
    ]) {
        form.elements.namedItem(key).value = initial[key] ?? '';
    }
    editor.showModal();
    form.elements.namedItem('title').focus();
}

function setSaving(value) {
    saving = value;
    form.querySelectorAll('button, input, select, textarea').forEach(
        (control) => {
            control.disabled = value;
        },
    );
    removeDialog.querySelectorAll('button').forEach((control) => {
        control.disabled = value;
    });
}

form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!isOwner(user) || saving) return;
    $('form-error').hidden = true;
    try {
        const payload = recommendationPayload(
            Object.fromEntries(new FormData(form)),
        );
        setSaving(true);
        const ref = doc(db, PUBLIC_COLLECTION, editingId);
        if (editingItem) {
            await updateDoc(ref, { ...payload, updatedAt: serverTimestamp() });
        } else {
            // Stable document ID makes a retry safe if a connection drops during publishing.
            await setDoc(ref, {
                ...payload,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
            });
        }
        editor.close();
        toast('Recommendation published. Everyone can see it now.');
    } catch (error) {
        $('form-error').textContent = error.code
            ? error.code === 'permission-denied'
                ? 'Publishing was denied. Sign in as the owner and check that the Watch Later access rules are deployed.'
                : 'Couldn’t save your recommendation. Your changes are still here; please try again.'
            : error.message;
        $('form-error').hidden = false;
    } finally {
        setSaving(false);
    }
});

$('remove-recommendation').addEventListener('click', () => {
    if (!isOwner(user) || !editingItem || saving) return;
    $('remove-description').textContent =
        `“${editingItem.title}” will disappear from the public collection. Your private watch list is unaffected.`;
    $('remove-error').hidden = true;
    removeDialog.showModal();
    $('cancel-remove').focus();
});
$('confirm-remove').addEventListener('click', async () => {
    if (!isOwner(user) || saving || !editingItem) return;
    setSaving(true);
    try {
        await deleteDoc(doc(db, PUBLIC_COLLECTION, editingId));
        removeDialog.close();
        editor.close();
        toast('Recommendation removed from the public collection.');
    } catch {
        $('remove-error').textContent =
            'Couldn’t remove this recommendation. Please try again.';
        $('remove-error').hidden = false;
    } finally {
        setSaving(false);
    }
});
$('cancel-remove').addEventListener('click', () => removeDialog.close());
$('close-editor').addEventListener('click', () => editor.close());
[editor, removeDialog].forEach((dialog) =>
    dialog.addEventListener('cancel', (event) => {
        if (saving) event.preventDefault();
    }),
);
$('add-recommendation').addEventListener('click', () => openEditor());
$('retry').addEventListener('click', subscribe);
$('search').addEventListener('input', (event) => {
    search = event.target.value;
    render();
});
document.querySelectorAll('[data-type]').forEach((button) =>
    button.addEventListener('click', () => {
        type = button.dataset.type;
        document
            .querySelectorAll('[data-type]')
            .forEach((control) =>
                control.setAttribute(
                    'aria-pressed',
                    String(control === button),
                ),
            );
        render();
    }),
);

signInButton.addEventListener('click', async () => {
    signInButton.disabled = true;
    $('account-status').textContent = 'Opening Google sign-in…';
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: 'select_account' });
    try {
        await persistence;
        await signInWithPopup(auth, provider);
    } catch (error) {
        if (error.code === 'auth/popup-blocked') {
            try {
                await signInWithRedirect(auth, provider);
            } catch {
                $('account-status').textContent =
                    'Google sign-in is unavailable. Please try again.';
            }
        } else {
            $('account-status').textContent =
                error.code === 'auth/popup-closed-by-user'
                    ? 'Sign-in cancelled. You can keep browsing.'
                    : 'Google sign-in is unavailable. Please try again.';
        }
    } finally {
        signInButton.disabled = false;
    }
});
$('sign-out').addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch {
        $('account-status').textContent =
            'Couldn’t sign out. Please try again.';
    }
});
onAuthStateChanged(auth, (nextUser) => {
    user = nextUser;
    const owner = isOwner(user);
    $('owner-toolbar').hidden = !owner;
    signInButton.hidden = !!user;
    $('sign-out').hidden = !user;
    $('account-status').textContent = owner
        ? 'Signed in as owner'
        : user
          ? 'You’re browsing as a visitor. Only Xander can edit this collection.'
          : '';
    if (!owner) {
        editor.close();
        removeDialog.close();
    }
    render();
    if (failed) subscribe();
});

subscribe();
