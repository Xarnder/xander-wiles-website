import test from 'node:test';
import assert from 'node:assert/strict';
import { formatAiWaitTime } from './ai-panel.js';

test('AI request duration supports immediate responses and long waits', () => {
    assert.equal(formatAiWaitTime(0), '0:00');
    assert.equal(formatAiWaitTime(999), '0:00');
    assert.equal(formatAiWaitTime(1500), '0:01');
    assert.equal(formatAiWaitTime(61000), '1:01');
    assert.equal(formatAiWaitTime(3600000), '60:00');
    assert.equal(formatAiWaitTime(-1000), '0:00');
});
