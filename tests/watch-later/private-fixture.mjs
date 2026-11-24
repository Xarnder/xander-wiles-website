// In-memory services for private UI tests and local visual QA. Never imported by the app.
export const writes = [];
const owner = { uid: 'test-owner', email: 'xanderwiles@gmail.com', emailVerified: true };
const poster = name => `https://image.tmdb.org/t/p/w342/${name}.jpg`;
const films = [
    ['Arrival', '2016', 'x2FJsf1ElAgr63Y3PNPtJrcmpoe', 'Drama'],
    ['Interstellar', '2014', 'gEU2QniE6E77NI6lCU6MxlNBvIx', 'Science Fiction'],
    ['The Batman', '2022', '74xTEgt7R36Fpooo50r9T25onhq', 'Crime'],
    ['Dune: Part Two', '2024', '1pdfLvkbY9ohJlCjQH2CZjjYVvJ', 'Science Fiction'],
    ['Blade Runner 2049', '2017', 'gajva2L0rPYkEWjzgFlBXCAVBE5', 'Science Fiction'],
    ['Inception', '2010', 'oYuLEt3zVCKq57qu2F8dT7NIa6f', 'Thriller'],
    ['The Prestige', '2006', 'bdN3gXuIZYaJP7ftKK2sU0nPtEA', 'Drama'],
    ['Mad Max: Fury Road', '2015', '8tZYtuWezp8JbcsvHYO0O46tFbo', 'Action'],
    ['Parasite', '2019', '7IiTTgloJzvGI1TAYymCfbfl3vT', 'Thriller'],
];
const records = {
    tiers: [{ id: 'first', name: 'Tier 1', order: 0 }, { id: 'second', name: 'Tier 2', order: 1 }],
    people: [{ id: 'friend', name: 'Friend' }],
    watches: films.map(([movieTitle, year, image, genre], index) => ({
        id: `film-${index}`, movieTitle, year, genre, thumb: poster(image), type: 'movie',
        tier: index < 6 ? 'first' : 'second', rank: index, watched: false,
        watchStatus: index === 1 ? 'rewatch' : 'first-watch', watchWith: index === 0 ? 'Friend' : '',
        url: `https://www.youtube.com/watch?v=fixture000${index}`, timestamp: 1000,
    })),
    publicRecommendations: films.map(([title, year, image, genre], index) => ({
        id: `pick-${index}`, title, year, genre, imageUrl: poster(image), type: 'movie',
        tier: index < 6 ? 'S' : 'A', rank: index, note: 'A recommendation note, available in Details mode.',
        trailerUrl: `https://www.youtube.com/watch?v=fixture000${index}`,
    })),
};
records.watches.push(
    { ...records.watches[0], id: 'watched', movieTitle: 'Already watched', watched: true },
    { ...records.watches[0], id: 'series', movieTitle: 'A series with a longer title', type: 'tv', year: '2023' },
);
records.publicRecommendations.push({ ...records.publicRecommendations[0], id: 'public-series', title: 'A series with a longer title', type: 'tv' });
[...records.tiers, ...records.people, ...records.watches].forEach(record => { record.uid = owner.uid; });
const listeners = new Map();
const snapshot = ref => {
    const docs = (records[ref.name] || []).map(record => ({ id: record.id, data: () => ({ ...record }) }));
    return { docs, empty: !docs.length, forEach: callback => docs.forEach(callback) };
};
const notify = name => listeners.get(name)?.forEach(callback => callback(snapshot({ name })));
export const initializeApp = () => ({});
export const getAuth = () => ({});
export const getFirestore = () => ({});
export class GoogleAuthProvider { setCustomParameters() {} }
export const browserLocalPersistence = {};
export const setPersistence = async () => {};
export const getRedirectResult = async () => null;
export const signInWithPopup = async () => {};
export const signInWithRedirect = async () => {};
let authCallback;
export const onAuthStateChanged = (_auth, callback) => {
    authCallback = callback;
    queueMicrotask(() => callback(new URLSearchParams(window.location.search).has('guest') ? null : owner));
};
export const signOut = async () => authCallback(null);
export const collection = (_db, name) => ({ name });
export const doc = (parent, name, id) => ({ name: parent.name || name, id: id || `added-${writes.length}` });
export const query = ref => ref;
export const where = () => ({});
export const getDocs = async ref => snapshot(ref);
export const onSnapshot = (ref, callback) => {
    if (!listeners.has(ref.name)) listeners.set(ref.name, new Set());
    listeners.get(ref.name).add(callback);
    queueMicrotask(() => callback(snapshot(ref)));
    return () => listeners.get(ref.name).delete(callback);
};
export const setDoc = async (ref, payload) => {
    writes.push({ op: 'create', ref, payload });
    records[ref.name].push({ ...payload, id: ref.id }); notify(ref.name);
};
export const addDoc = async (ref, payload) => { const next = { ...ref, id: `added-${writes.length}` }; await setDoc(next, payload); return next; };
export const updateDoc = async (ref, payload) => {
    writes.push({ op: 'update', ref, payload });
    Object.assign(records[ref.name].find(record => record.id === ref.id), payload); notify(ref.name);
};
export const deleteDoc = async ref => {
    writes.push({ op: 'delete', ref }); records[ref.name] = records[ref.name].filter(record => record.id !== ref.id); notify(ref.name);
};
export const writeBatch = () => {
    const operations = [];
    return { update: (...args) => operations.push(() => updateDoc(...args)), delete: (...args) => operations.push(() => deleteDoc(...args)), commit: async () => { for (const operation of operations) await operation(); } };
};
export const serverTimestamp = () => 123;
