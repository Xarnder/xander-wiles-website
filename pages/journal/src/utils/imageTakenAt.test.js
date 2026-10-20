import test from 'node:test';
import assert from 'node:assert/strict';
import {
    exifValueToTakenAt,
    formatImageExportSection,
    formatImageList,
    formatImageTakenLabel,
    imageForSave,
    imagesForSave,
    takenAtFromExif
} from './imageTakenAt.js';

const entryDate = '2026-10-20';

test('reads the camera time from EXIF without shifting it', () => {
    assert.equal(exifValueToTakenAt('2026:10:20 15:45:09'), '2026-10-20T15:45:09');
    assert.equal(exifValueToTakenAt('2026-10-19 00:05:00'), '2026-10-19T00:05:00');
    assert.equal(exifValueToTakenAt('not a date'), null);
    assert.equal(exifValueToTakenAt('2026:02:31 10:00:00'), null);
});

test('prefers when the photo was taken over when the file was created', () => {
    assert.equal(takenAtFromExif({
        DateTimeOriginal: '2026:10:20 15:45:09',
        CreateDate: '2026:10:18 08:00:00'
    }), '2026-10-20T15:45:09');
    assert.equal(takenAtFromExif({
        CreateDate: '2026:10:18 08:00:00'
    }), '2026-10-18T08:00:00');
    assert.equal(takenAtFromExif(null), null);
});

test('shows only the 12-hour time when the photo is from the entry day', () => {
    assert.equal(formatImageTakenLabel('2026-10-20T15:45:09', entryDate), '3:45 PM');
    assert.equal(formatImageTakenLabel('2026-10-20T00:05:00', entryDate), '12:05 AM');
    assert.equal(formatImageTakenLabel('2026-10-20T12:00:00', entryDate), '12:00 PM');
});

test('puts Yesterday next to the time for the day before the entry', () => {
    assert.equal(formatImageTakenLabel('2026-10-19T09:30:00', entryDate), 'Yesterday 9:30 AM');
});

test('shows the date and time for earlier photos inside 24 days', () => {
    assert.equal(formatImageTakenLabel('2026-10-10T15:45:00', entryDate), '10 Oct, 3:45 PM');
    assert.equal(formatImageTakenLabel('2026-09-26T08:15:00', entryDate), '26 Sep, 8:15 AM');
    assert.equal(formatImageTakenLabel('2025-12-28T21:05:00', '2026-01-05'), '28 Dec 2025, 9:05 PM');
});

test('hides photos outside the 24 days before the entry', () => {
    assert.equal(formatImageTakenLabel('2026-09-25T15:45:00', entryDate), null);
    assert.equal(formatImageTakenLabel('2026-10-21T15:45:00', entryDate), null);
    assert.equal(formatImageTakenLabel('', entryDate), null);
    assert.equal(formatImageTakenLabel('2026-10-20T15:45:00', 'not-a-date'), null);
});

test('prepares a Firestore image record with the camera time', () => {
    assert.deepEqual(imageForSave({
        url: 'https://example.com/photo.webp',
        path: 'users/u/images/photo.webp',
        size: 1200,
        caption: 'At the lake',
        takenAt: '2026:10:20 15:45:09',
        extra: 'drop me'
    }), {
        url: 'https://example.com/photo.webp',
        path: 'users/u/images/photo.webp',
        size: 1200,
        caption: 'At the lake',
        takenAt: '2026-10-20T15:45:09'
    });

    assert.deepEqual(imagesForSave([
        { url: 'https://example.com/a.webp', takenAt: 'not-a-date' },
        { caption: 'missing url', takenAt: '2026-10-20T15:45:09' }
    ]), [{
        url: 'https://example.com/a.webp',
        path: null,
        size: 0,
        caption: ''
    }]);
});

test('export lines include the same photo time as the journal', () => {
    const images = [{
        url: 'https://example.com/photo.webp',
        caption: 'At the lake',
        takenAt: '2026-10-20T15:45:09'
    }, {
        url: 'https://example.com/older.webp',
        takenAt: '2026-10-19T09:30:00'
    }];

    assert.equal(
        formatImageList(images, entryDate, 'text'),
        'Photo 1: 3:45 PM — At the lake; Photo 2: Yesterday 9:30 AM'
    );
    assert.equal(
        formatImageList(images, entryDate, 'markdown'),
        '- 📷 Attachment 1: 3:45 PM — *At the lake* ([link](https://example.com/photo.webp))\n- 📷 Attachment 2: Yesterday 9:30 AM ([link](https://example.com/older.webp))'
    );
    assert.match(formatImageExportSection(images, entryDate, 'txt'), /Photos\n------\nPhoto 1: 3:45 PM — At the lake/);
    assert.match(formatImageExportSection(images, entryDate, 'md'), /## Photos\n\n- 📷 Attachment 1: 3:45 PM/);
});
