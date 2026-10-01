/**
 * Run: node --test pages/Markdown-Editor/ai-usage.test.js
 */

import assert from 'node:assert/strict';
import test from 'node:test';
import { clearAiCalls, readAiCalls, recordAiCall, summarizeAiCosts } from './ai-usage.js';

function memoryStorage() {
    const data = new Map();
    return {
        getItem(key) {
            return data.has(key) ? data.get(key) : null;
        },
        setItem(key, value) {
            data.set(key, String(value));
        },
        removeItem(key) {
            data.delete(key);
        },
    };
}

test('summarizeAiCosts splits today, this week, and this month', () => {
    const now = new Date(2026, 9, 1, 15, 0, 0).getTime();
    const entries = [
        { at: new Date(2026, 9, 1, 10, 0, 0).getTime(), usd: 0.01 },
        { at: new Date(2026, 8, 30, 10, 0, 0).getTime(), usd: 0.02 },
        { at: new Date(2026, 8, 27, 10, 0, 0).getTime(), usd: 0.04 },
        { at: now + 60_000, usd: 0.08 },
    ];
    const totals = summarizeAiCosts(entries, now);
    assert.equal(totals.today, 0.01);
    assert.equal(totals.week, 0.03);
    assert.equal(totals.month, 0.01);
});

test('recordAiCall keeps the newest call and its token cost', () => {
    globalThis.localStorage = memoryStorage();
    clearAiCalls();
    recordAiCall({
        at: Date.now(),
        task: 'revise',
        fileName: 'Ideas.md',
        inputTokens: 3000,
        outputTokens: 3000,
        thoughtTokens: 0,
    });
    const [latest] = readAiCalls();
    assert.equal(latest.fileName, 'Ideas.md');
    assert.equal(latest.task, 'revise');
    assert.ok(Math.abs(latest.usd - 0.00525) < 1e-9);
    clearAiCalls();
    assert.equal(readAiCalls().length, 0);
});
