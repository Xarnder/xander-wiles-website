import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getDateRangeForPreset,
    extractEntryTitleAndContent,
    formatEntryToText,
    formatEntryToMarkdown,
    combineEntries,
    countWords
} from './clipboardExport.js';

test('getDateRangeForPreset calculates correct date ranges for presets', () => {
    // Reference date: Monday, September 21, 2026
    const baseDate = new Date(2026, 8, 21);

    // Current week: Monday 2026-09-21 to Sunday 2026-09-27
    const currentWeek = getDateRangeForPreset('current-week', { baseDate });
    assert.equal(currentWeek.start, '2026-09-21');
    assert.equal(currentWeek.end, '2026-09-27');

    // Last 7 days: 2026-09-15 to 2026-09-21 (7 days inclusive)
    const last7Days = getDateRangeForPreset('last-7-days', { baseDate });
    assert.equal(last7Days.start, '2026-09-15');
    assert.equal(last7Days.end, '2026-09-21');

    // Current month so far: 2026-09-01 to 2026-09-21
    const monthSoFar = getDateRangeForPreset('current-month-so-far', { baseDate });
    assert.equal(monthSoFar.start, '2026-09-01');
    assert.equal(monthSoFar.end, '2026-09-21');

    // Whole month: 2026-09-01 to 2026-09-30
    const wholeMonth = getDateRangeForPreset('whole-month', { baseDate, selectedMonth: '2026-09' });
    assert.equal(wholeMonth.start, '2026-09-01');
    assert.equal(wholeMonth.end, '2026-09-30');

    // Specific past month (February leap year vs non-leap year: 2024 is leap, 2026 is non-leap)
    const feb2026 = getDateRangeForPreset('whole-month', { selectedMonth: '2026-02' });
    assert.equal(feb2026.start, '2026-02-01');
    assert.equal(feb2026.end, '2026-02-28');

    // Last 6 months: 6 months before September 2026 -> March 21, 2026 to September 21, 2026
    const last6Months = getDateRangeForPreset('last-6-months', { baseDate });
    assert.equal(last6Months.start, '2026-03-21');
    assert.equal(last6Months.end, '2026-09-21');

    // Custom date range
    const custom = getDateRangeForPreset('custom', { customStart: '2026-01-01', customEnd: '2026-01-15' });
    assert.equal(custom.start, '2026-01-01');
    assert.equal(custom.end, '2026-01-15');
});

test('extractEntryTitleAndContent cleans titles from ++Title++ format and markdown', () => {
    const entry1 = {
        title: '',
        content: '**++2026-09-21 - A Productive Day++**\n\nToday was very productive and fruitful.'
    };
    const res1 = extractEntryTitleAndContent(entry1);
    assert.equal(res1.title, 'A Productive Day');
    assert.equal(res1.content, 'Today was very productive and fruitful.');

    const entry2 = {
        title: 'My Custom Title',
        content: 'Just regular notes.'
    };
    const res2 = extractEntryTitleAndContent(entry2);
    assert.equal(res2.title, 'My Custom Title');
    assert.equal(res2.content, 'Just regular notes.');

    const entry3 = {
        title: '',
        content: '# Deep Thoughts\nReflecting on the week.'
    };
    const res3 = extractEntryTitleAndContent(entry3);
    assert.equal(res3.title, 'Deep Thoughts');
});

test('formatEntryToText formats entries with metadata and sections', () => {
    const entry = {
        id: '2026-09-21',
        title: 'Morning Routine',
        content: 'Woke up early and meditated.',
        isSpecial: true,
        mood: 'Calm',
        tags: ['tag_1'],
        subEntries: {
            sec_1: { title: 'Dreams', content: 'Dreamt of flying.' }
        },
        numericEntries: {
            field_1: 45
        }
    };

    const text = formatEntryToText(entry, {
        tagDefinitions: { tag_1: { name: 'Health' } },
        entrySectionNameById: { sec_1: 'Dream Section' },
        numericFieldNameById: { field_1: 'Exercise (mins)' }
    });

    assert.ok(text.includes('=== 2026-09-21'));
    assert.ok(text.includes('Morning Routine'));
    assert.ok(text.includes('★ Special Day'));
    assert.ok(text.includes('Mood: Calm'));
    assert.ok(text.includes('Tags: Health'));
    assert.ok(text.includes('Woke up early and meditated.'));
    assert.ok(text.includes('[Dream Section: Dreams]'));
    assert.ok(text.includes('Dreamt of flying.'));
    assert.ok(text.includes('[Numerical Inputs]'));
    assert.ok(text.includes('- Exercise (mins): 45'));
});

test('formatEntryToMarkdown formats entries cleanly in markdown', () => {
    const entry = {
        id: '2026-09-21',
        title: 'Project Launch',
        content: 'Everything went live smoothly.',
        mood: 'Excited',
        tags: ['t1'],
        subEntries: {
            s1: { title: 'Reflection', content: 'Team did great work.' }
        }
    };

    const md = formatEntryToMarkdown(entry, {
        tagDefinitions: { t1: { name: 'Work' } },
        entrySectionNameById: { s1: 'Retrospective' }
    });

    assert.ok(md.includes('## 2026-09-21: Project Launch'));
    assert.ok(md.includes('**Mood**: Excited'));
    assert.ok(md.includes('**Tags**: #Work'));
    assert.ok(md.includes('Everything went live smoothly.'));
    assert.ok(md.includes('### Retrospective: Reflection'));
    assert.ok(md.includes('Team did great work.'));
});

test('combineEntries sorts and joins multiple entries with divider', () => {
    const entries = [
        { id: '2026-09-20', title: 'Day 2', content: 'Second day.' },
        { id: '2026-09-19', title: 'Day 1', content: 'First day.' }
    ];

    // Ascending order (oldest first)
    const combinedAsc = combineEntries(entries, 'markdown', { sortOrder: 'asc' });
    const day1Idx = combinedAsc.indexOf('2026-09-19');
    const day2Idx = combinedAsc.indexOf('2026-09-20');
    assert.ok(day1Idx < day2Idx);
    assert.ok(combinedAsc.includes('---'));

    // Descending order (newest first)
    const combinedDesc = combineEntries(entries, 'markdown', { sortOrder: 'desc' });
    const day1DescIdx = combinedDesc.indexOf('2026-09-19');
    const day2DescIdx = combinedDesc.indexOf('2026-09-20');
    assert.ok(day2DescIdx < day1DescIdx);
});

test('countWords accurately calculates word counts', () => {
    assert.equal(countWords(''), 0);
    assert.equal(countWords('   '), 0);
    assert.equal(countWords('Hello world'), 2);
    assert.equal(countWords('This is a test of five words.'), 7);
    assert.equal(countWords('Word1\nWord2\t\nWord3'), 3);
});
