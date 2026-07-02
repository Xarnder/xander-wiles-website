/**
 * One-time seed: CSV + idea-images.json + local images → Firestore + Storage
 *
 * Prerequisites:
 *   1. Firebase project `beautifully-living-xander` with Firestore + Storage enabled
 *   2. Service account key JSON (Firebase Console → Project settings → Service accounts)
 *   3. Env in repo root `.env.local` OR export:
 *        GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *
 * Usage (from repo root):
 *   npm install firebase-admin
 *   node pages/Home-Design/scripts/seed-firestore.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import { randomUUID } from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const homeDesignDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(homeDesignDir, '../..');

const require = createRequire(import.meta.url);
try {
    require('dotenv').config({ path: path.join(repoRoot, '.env') });
    require('dotenv').config({ path: path.join(repoRoot, '.env.local'), override: true });
} catch {
    // dotenv optional
}

const { initializeApp, cert, getApps } = await import('firebase-admin/app');
const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');

const PROJECT_ID = process.env.PUBLIC_HOME_DESIGN_FIREBASE_PROJECT_ID || 'beautifully-living-xander';
const STORAGE_BUCKET = process.env.PUBLIC_HOME_DESIGN_FIREBASE_STORAGE_BUCKET || `${PROJECT_ID}.firebasestorage.app`;

function clean(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i += 1) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                field += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
            continue;
        }

        if (char === ',' && !inQuotes) {
            row.push(field);
            field = '';
            continue;
        }

        if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') i += 1;
            row.push(field);
            if (row.some((cell) => clean(cell))) rows.push(row);
            row = [];
            field = '';
            continue;
        }

        field += char;
    }

    row.push(field);
    if (row.some((cell) => clean(cell))) rows.push(row);
    return rows;
}

function rowsToObjects(csvRows) {
    if (!csvRows.length) return [];

    const headers = csvRows[0].map((header) => clean(header));
    return csvRows.slice(1).map((cells, index) => {
        const row = {};
        headers.forEach((header, headerIndex) => {
            row[header] = clean(cells[headerIndex]);
        });

        return {
            ideaId: row.idea_id || `idea-${String(index + 1).padStart(4, '0')}`,
            section: row.section || 'More ideas',
            subsection: row.subsection || '',
            level: Number.parseInt(row.level, 10) || 1,
            parentItem: row.parent_item || '',
            title: row.title || '',
            description: row.description || '',
            fullText: row.full_text || '',
            images: [],
            sortIndex: index
        };
    }).filter((row) => row.title || row.description || row.fullText);
}

function resolveCredentialsPath() {
    const credPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credPath) return '';

    if (path.isAbsolute(credPath)) return credPath;
    return path.resolve(repoRoot, credPath);
}

function initAdmin() {
    if (getApps().length) return getApps()[0];

    const credPath = resolveCredentialsPath();
    if (!credPath || !fs.existsSync(credPath)) {
        throw new Error(
            'Set GOOGLE_APPLICATION_CREDENTIALS in .env.local to your Firebase service account JSON path (e.g. secrets/beautifully-living-xander-service-account.json).'
        );
    }

    const serviceAccount = JSON.parse(fs.readFileSync(credPath, 'utf8'));

    return initializeApp({
        credential: cert(serviceAccount),
        projectId: PROJECT_ID,
        storageBucket: STORAGE_BUCKET
    });
}

async function uploadLocalImage(bucket, ideaId, relativePath) {
    const absolutePath = path.join(homeDesignDir, relativePath);
    if (!fs.existsSync(absolutePath)) {
        console.warn(`  Missing file: ${relativePath}`);
        return null;
    }

    const fileName = path.basename(relativePath);
    const destination = `ideas/${ideaId}/${fileName}`;
    const token = randomUUID();

    await bucket.upload(absolutePath, {
        destination,
        metadata: {
            contentType: 'image/webp',
            metadata: { firebaseStorageDownloadTokens: token }
        }
    });

    const encoded = encodeURIComponent(destination);
    return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encoded}?alt=media&token=${token}`;
}

async function main() {
    initAdmin();
    const db = getFirestore();
    const bucket = getStorage().bucket();

    const csvText = fs.readFileSync(path.join(homeDesignDir, 'Home Design Bullets.csv'), 'utf8');
    const manifest = JSON.parse(fs.readFileSync(path.join(homeDesignDir, 'idea-images.json'), 'utf8'));
    const rows = rowsToObjects(parseCsv(csvText));

    const manifestById = new Map();
    Object.entries(manifest).forEach(([key, value]) => {
        if (key.startsWith('_')) return;
        manifestById.set(key, Array.isArray(value) ? value : [value]);
    });

    console.log(`Seeding ${rows.length} ideas…`);

    let maxIdeaNumber = 0;
    let imagesUploaded = 0;

    for (const row of rows) {
        const match = row.ideaId.match(/idea-(\d+)/);
        if (match) maxIdeaNumber = Math.max(maxIdeaNumber, Number.parseInt(match[1], 10));

        const imagePaths = manifestById.get(row.ideaId) || [];
        const imageUrls = [];

        for (const imagePath of imagePaths) {
            const url = await uploadLocalImage(bucket, row.ideaId, clean(imagePath));
            if (url) {
                imageUrls.push(url);
                imagesUploaded += 1;
            }
        }

        await db.collection('ideas').doc(row.ideaId).set({
            ...row,
            images: imageUrls,
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp()
        }, { merge: true });
    }

    await db.collection('meta').doc('schema').set({
        version: 1,
        seededAt: FieldValue.serverTimestamp(),
        rowCount: rows.length
    }, { merge: true });

    await db.collection('meta').doc('counters').set({
        lastIdeaNumber: maxIdeaNumber
    }, { merge: true });

    console.log(`Done. Ideas: ${rows.length}, images uploaded: ${imagesUploaded}`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
